from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import AsyncSessionLocal
from ..models import Job, VpsInstance
from ..schemas.jobs import JobConfig
from .metrics_cache import invalidate as _invalidate_metrics
from .ssh import SshTransfer
from .storage import StorageService
from .worker import WorkerClient

logger = logging.getLogger(__name__)

_ACTIVE = ("QUEUED", "RUNNING")
_TERMINAL = ("COMPLETED", "FAILED", "CANCELLED")
_POLL_INTERVAL_S = 20

# Serializes promotion so poll-on-read and the background loop can't both dispatch.
_promote_lock = asyncio.Lock()


def _worker_for(vps: VpsInstance) -> WorkerClient:
    return WorkerClient(vps)


async def _vps_of(db: AsyncSession, job: Job) -> VpsInstance | None:
    if job.vps_id is None:
        return None
    result = await db.execute(select(VpsInstance).where(VpsInstance.id == job.vps_id))
    return result.scalar_one_or_none()


async def _busy_vps_ids(db: AsyncSession) -> set[uuid.UUID]:
    """vps_ids that currently have a RUNNING job, each VPS runs at most one."""
    result = await db.execute(select(Job.vps_id).where(Job.status == "RUNNING"))
    return {row[0] for row in result.all() if row[0] is not None}


async def sync_running_job(db: AsyncSession) -> None:
    """Refresh the status of every RUNNING job (one per VPS) from its worker."""
    result = await db.execute(
        select(Job).where(Job.status == "RUNNING", Job.worker_session.is_not(None))
    )
    for job in result.scalars().all():
        await _sync_one(db, job)


async def _sync_one(db: AsyncSession, job: Job) -> None:
    vps = await _vps_of(db, job)
    if vps is None:
        return
    try:
        new_status, error = await _worker_for(vps).get_status(job.id)
    except Exception as exc:  # SSH hiccup, leave state untouched, retry next poll
        logger.warning("Worker status fetch failed for %s: %s", job.id, exc)
        return
    if new_status == job.status:
        return

    now = datetime.now(timezone.utc)
    values: dict = {"status": new_status}
    if new_status in _TERMINAL:
        values["finished_at"] = now
        _invalidate_metrics(str(job.id))
    if new_status == "COMPLETED" and job.output_file_key is None:
        values["output_file_key"] = f"outputs/{job.id}/result.csv"
    if new_status == "FAILED" and error:
        values["error_message"] = error
    await db.execute(update(Job).where(Job.id == job.id).values(**values))
    await db.commit()
    await db.refresh(job)


async def try_promote(db: AsyncSession) -> None:
    """Dispatch the oldest QUEUED job on every active VPS that isn't already RUNNING one."""
    async with _promote_lock:
        busy = await _busy_vps_ids(db)
        result = await db.execute(
            select(VpsInstance).where(VpsInstance.is_active == True)  # noqa: E712
        )
        for vps in result.scalars().all():
            if vps.id in busy:
                continue
            await _promote_one(db, vps)


async def _promote_one(db: AsyncSession, vps: VpsInstance) -> None:
    result = await db.execute(
        select(Job)
        .where(Job.status == "QUEUED", Job.vps_id == vps.id)
        .order_by(Job.created_at)
        .limit(1)
    )
    job = result.scalar_one_or_none()
    if job is None:
        return

    worker = _worker_for(vps)
    try:
        if await worker.has_active_session():
            return  # worker busy with an out-of-band run, retry next cycle
        if not vps.is_local:
            await push_input(vps, job.id, job.input_file_key, job.input_filename)
        config = JobConfig(**job.config)
        session = await worker.trigger(job.id, job.input_file_key, config)
    except Exception as exc:
        logger.error("Failed to dispatch job %s: %s", job.id, exc)
        await db.execute(
            update(Job)
            .where(Job.id == job.id)
            .values(
                status="FAILED",
                finished_at=datetime.now(timezone.utc),
                error_message=f"Dispatch failed: {exc}",
            )
        )
        await db.commit()
        return

    await db.execute(
        update(Job)
        .where(Job.id == job.id)
        .values(
            status="RUNNING",
            worker_session=session,
            started_at=datetime.now(timezone.utc),
        )
    )
    await db.commit()
    await db.refresh(job)


async def push_input(vps: VpsInstance, job_id, file_key: str, filename: str) -> None:
    """SFTP the uploaded input file to the worker before it can be dispatched."""
    storage = StorageService(_data_dir())
    local_input = storage.input_path(job_id, filename)
    remote_input = f"{vps.data_dir}/{file_key}"
    await SshTransfer.push_file(vps, local_input, remote_input)


def _data_dir():
    from ..settings import get_settings

    return get_settings().data_dir


async def queue_loop() -> None:
    """Background heartbeat: sync the running job and promote the next queued one."""
    logger.info("Job queue loop started (interval=%ss)", _POLL_INTERVAL_S)
    while True:
        try:
            async with AsyncSessionLocal() as db:
                await sync_running_job(db)
                await try_promote(db)
        except asyncio.CancelledError:
            logger.info("Job queue loop stopping")
            raise
        except Exception as exc:
            logger.error("Job queue loop iteration failed: %s", exc)
        await asyncio.sleep(_POLL_INTERVAL_S)
