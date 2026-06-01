from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..services.metrics_cache import invalidate as _invalidate_metrics
from ..models import Job, VpsInstance
from ..schemas.jobs import (
    JobConfig,
    JobDownloadResponse,
    JobListResponse,
    JobLogsResponse,
    JobResponse,
)
from ..services.kestra import KestraClient
from ..services.ssh import SshTransfer
from ..services.storage import StorageService
from ..settings import get_settings

router = APIRouter(tags=["jobs"])

_MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100 MB
_ALLOWED_EXTENSIONS = {".jsonl", ".csv"}

# TODO: add auth — replace placeholder user_id with real current user
_PLACEHOLDER_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


def _get_storage() -> StorageService:
    return StorageService(get_settings().data_dir)


@router.post("", response_model=JobResponse, status_code=201)
async def create_job(
    file: UploadFile,
    enable_proxy: bool = False,
    skip_duplicates: bool = True,
    vps_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    storage: StorageService = Depends(_get_storage),
) -> Job:
    # TODO: add auth
    _validate_upload(file)

    data = await file.read()
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File exceeds 100 MB limit")

    vps = await _resolve_vps(db, vps_id)
    job_id = uuid.uuid4()
    config = JobConfig(enable_proxy=enable_proxy, skip_duplicates=skip_duplicates)

    file_key = storage.save_upload(job_id, file.filename or "input.jsonl", data)

    job = Job(
        id=job_id,
        user_id=_PLACEHOLDER_USER_ID,
        vps_id=vps.id,
        status="QUEUED",
        input_filename=file.filename or "input.jsonl",
        input_file_key=file_key,
        config={
            "enable_proxy": config.enable_proxy,
            "skip_duplicates": config.skip_duplicates,
        },
    )
    db.add(job)
    await db.flush()

    if not vps.is_local:
        local_input = storage.input_path(job_id, file.filename or "input.jsonl")
        remote_input = f"{vps.data_dir}/{file_key}"
        try:
            await SshTransfer.push_file(vps, local_input, remote_input)
        except RuntimeError as exc:
            job.status = "FAILED"
            job.error_message = str(exc)
            await db.commit()
            await db.refresh(job)
            return job  # type: ignore[return-value]

    kestra = KestraClient(vps.kestra_url, vps.kestra_webhook_key)
    try:
        execution_id = await kestra.trigger(job_id, file_key, config)
        job.kestra_execution_id = execution_id
    except Exception as exc:
        job.status = "FAILED"
        job.error_message = f"Failed to trigger Kestra: {exc}"

    await db.commit()
    await db.refresh(job)
    return job  # type: ignore[return-value]


@router.get("", response_model=JobListResponse)
async def list_jobs(db: AsyncSession = Depends(get_db)) -> JobListResponse:
    # TODO: add auth — filter by current user
    result = await db.execute(select(Job).order_by(Job.created_at.desc()))
    jobs = result.scalars().all()
    active = [j for j in jobs if j.status in ("QUEUED", "RUNNING") and j.kestra_execution_id]
    if active:
        vps_clients: dict[str, KestraClient] = {}
        for job in active:
            vid = str(job.vps_id) if job.vps_id else ""
            if vid not in vps_clients:
                vps = await _load_vps(db, job)
                if vps:
                    vps_clients[vid] = KestraClient(vps.kestra_url, vps.kestra_webhook_key)
            if vid in vps_clients:
                await _sync_status(db, job, vps_clients[vid])
    return JobListResponse(jobs=list(jobs), total=len(jobs))  # type: ignore[arg-type]


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> Job:
    # TODO: add auth
    job = await _fetch_job(db, job_id)
    vps = await _load_vps(db, job)
    if vps:
        kestra = KestraClient(vps.kestra_url, vps.kestra_webhook_key)
        await _sync_status(db, job, kestra)
    return job  # type: ignore[return-value]


@router.get("/{job_id}/logs", response_model=JobLogsResponse)
async def get_logs(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    storage: StorageService = Depends(_get_storage),
) -> JobLogsResponse:
    # TODO: add auth
    await _fetch_job(db, job_id)
    lines = storage.read_log_tail(job_id)
    return JobLogsResponse(lines=lines)


@router.get("/{job_id}/download", response_model=JobDownloadResponse)
async def get_download_url(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    storage: StorageService = Depends(_get_storage),
) -> JobDownloadResponse:
    # TODO: add auth
    job = await _fetch_job(db, job_id)
    if job.status != "COMPLETED":
        raise HTTPException(409, "Job is not yet completed")
    vps = await _load_vps(db, job)
    await _ensure_output_local(job, vps, storage)
    if not storage.output_exists(job_id):
        raise HTTPException(404, "Output file not found")
    return JobDownloadResponse(url=f"/api/jobs/{job_id}/file")


@router.get("/{job_id}/file")
async def download_file(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    storage: StorageService = Depends(_get_storage),
) -> FileResponse:
    # TODO: add auth
    job = await _fetch_job(db, job_id)
    if job.status != "COMPLETED":
        raise HTTPException(409, "Job is not yet completed")
    vps = await _load_vps(db, job)
    await _ensure_output_local(job, vps, storage)
    path = storage.output_path(job_id)
    if not path.exists():
        raise HTTPException(404, "Output file not found")
    return FileResponse(path, filename=f"result_{job_id}.csv", media_type="text/csv")


@router.delete("/{job_id}", status_code=204, response_model=None)
async def cancel_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    # TODO: add auth
    job = await _fetch_job(db, job_id)
    if job.status not in ("QUEUED", "RUNNING"):
        raise HTTPException(409, f"Cannot cancel a job with status {job.status}")
    if job.kestra_execution_id:
        vps = await _load_vps(db, job)
        if vps:
            kestra = KestraClient(vps.kestra_url, vps.kestra_webhook_key)
            await kestra.cancel(job.kestra_execution_id)
    await db.execute(
        update(Job)
        .where(Job.id == job_id)
        .values(status="CANCELLED", finished_at=datetime.now(timezone.utc))
    )
    await db.commit()


# ── Helpers ──────────────────────────────────────────────────────────────────


def _validate_upload(file: UploadFile) -> None:
    if not file.filename:
        raise HTTPException(400, "Filename is required")
    ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            400, f"File type not allowed. Accepted: {', '.join(_ALLOWED_EXTENSIONS)}"
        )


async def _fetch_job(db: AsyncSession, job_id: uuid.UUID) -> Job:
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(404, f"Job {job_id} not found")
    return job


async def _load_vps(db: AsyncSession, job: Job) -> VpsInstance | None:
    if job.vps_id is None:
        return None
    result = await db.execute(
        select(VpsInstance).where(VpsInstance.id == job.vps_id)
    )
    return result.scalar_one_or_none()


async def _resolve_vps(db: AsyncSession, vps_id: uuid.UUID | None) -> VpsInstance:
    """Return the requested VPS, or the first active local VPS as default."""
    if vps_id is not None:
        result = await db.execute(
            select(VpsInstance).where(
                VpsInstance.id == vps_id, VpsInstance.is_active == True  # noqa: E712
            )
        )
        vps = result.scalar_one_or_none()
        if vps is None:
            raise HTTPException(404, f"VPS {vps_id} not found or inactive")
        return vps

    result = await db.execute(
        select(VpsInstance)
        .where(VpsInstance.is_active == True)  # noqa: E712
        .order_by(VpsInstance.is_local.desc(), VpsInstance.created_at)
        .limit(1)
    )
    vps = result.scalar_one_or_none()
    if vps is None:
        raise HTTPException(503, "No active VPS configured")
    return vps


async def _ensure_output_local(
    job: Job, vps: VpsInstance | None, storage: StorageService
) -> None:
    """SSH-pull the output CSV from a remote VPS if it's not already local."""
    if vps is None or vps.is_local or storage.output_exists(job.id):
        return
    remote_path = f"{vps.data_dir}/outputs/{job.id}/result.csv"
    local_path = storage.output_path(job.id)
    try:
        await SshTransfer.pull_file(vps, remote_path, local_path)
    except RuntimeError as exc:
        logging.getLogger(__name__).error("Output pull failed for %s: %s", job.id, exc)
        raise HTTPException(502, "Could not retrieve output from remote VPS") from exc


async def _sync_status(db: AsyncSession, job: Job, kestra: KestraClient) -> None:
    """Pull current state from Kestra and update the DB if it changed."""
    if (
        job.status in ("COMPLETED", "FAILED", "CANCELLED")
        or not job.kestra_execution_id
    ):
        return
    try:
        new_status = await kestra.get_status(job.kestra_execution_id)
    except Exception as exc:
        logging.getLogger(__name__).warning(
            "Kestra status fetch failed for %s: %s", job.id, exc
        )
        return

    if new_status == job.status:
        return

    now = datetime.now(timezone.utc)
    values: dict = {"status": new_status}
    if new_status == "RUNNING" and job.started_at is None:
        values["started_at"] = now
    if new_status in ("COMPLETED", "FAILED", "CANCELLED"):
        values["finished_at"] = now
        _invalidate_metrics(str(job.id))
    if new_status == "COMPLETED" and job.output_file_key is None:
        values["output_file_key"] = f"outputs/{job.id}/result.csv"

    await db.execute(update(Job).where(Job.id == job.id).values(**values))
    await db.commit()
    await db.refresh(job)
