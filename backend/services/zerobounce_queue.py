from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import AsyncSessionLocal
from ..models import ZeroBounceJob
from ..settings import get_settings
from . import zerobounce_runner

logger = logging.getLogger(__name__)

_POLL_INTERVAL_S = 5

# Serializes promotion so poll-on-read and the background loop can't both dispatch.
_promote_lock = asyncio.Lock()

# asyncio only holds a weak reference to a task returned by create_task(), an
# unreferenced task is eligible for GC mid-run. Since at most one ZeroBounce
# job runs at a time by design, one module-level slot is enough to keep it
# alive for its full duration.
_active_task: asyncio.Task[None] | None = None


def _paths(job: ZeroBounceJob, data_dir: Path) -> tuple[Path, Path]:
    input_dir = data_dir / "zerobounce" / str(job.id)
    return input_dir / job.input_filename, input_dir / "output.csv"


async def reconcile_orphaned(db: AsyncSession) -> None:
    """Mark RUNNING jobs left over from a previous process as FAILED.

    run_zerobounce executes as an in-process asyncio task with no external
    supervisor, a backend restart kills the task without updating the row,
    which would otherwise wedge the queue (try_promote refuses to dispatch
    while any job is RUNNING) forever after every restart.
    """
    result = await db.execute(
        select(ZeroBounceJob).where(ZeroBounceJob.status == "RUNNING")
    )
    orphaned = result.scalars().all()
    for job in orphaned:
        logger.warning("Reconciling orphaned ZeroBounce job %s as FAILED", job.id)
    if orphaned:
        await db.execute(
            update(ZeroBounceJob)
            .where(ZeroBounceJob.status == "RUNNING")
            .values(
                status="FAILED",
                error_message="Interrupted by backend restart",
                finished_at=datetime.now(timezone.utc),
            )
        )
        await db.commit()


async def try_promote(db: AsyncSession, data_dir: Path | None = None) -> None:
    """Dispatch the oldest QUEUED ZeroBounce job if none is currently RUNNING."""
    async with _promote_lock:
        running = await db.execute(
            select(ZeroBounceJob.id).where(ZeroBounceJob.status == "RUNNING")
        )
        if running.first() is not None:
            return

        result = await db.execute(
            select(ZeroBounceJob)
            .where(ZeroBounceJob.status == "QUEUED")
            .order_by(ZeroBounceJob.created_at)
            .limit(1)
        )
        job = result.scalar_one_or_none()
        if job is None:
            return

        input_path, output_path = _paths(job, data_dir or get_settings().data_dir)

        # Flip to RUNNING synchronously, still holding the lock, before the
        # task below has run even one line. run_zerobounce does its actual
        # work in the background, but if the DB isn't updated until *it*
        # gets scheduled, a try_promote call arriving between here and then
        # (another request, or the next queue_loop tick) still sees this job
        # as QUEUED and dispatches a second one on top of it.
        await db.execute(
            update(ZeroBounceJob)
            .where(ZeroBounceJob.id == job.id)
            .values(status="RUNNING", started_at=datetime.now(timezone.utc))
        )
        await db.commit()

        global _active_task
        _active_task = asyncio.create_task(
            zerobounce_runner.run_zerobounce(
                job_id=job.id,
                input_path=input_path,
                output_path=output_path,
                email_col=job.email_col,
                session_factory=AsyncSessionLocal,
            )
        )
        _active_task.add_done_callback(_clear_active_task)


def _clear_active_task(_: asyncio.Task[None]) -> None:
    global _active_task
    _active_task = None


async def queue_loop() -> None:
    """Background heartbeat: promote the next queued ZeroBounce job."""
    logger.info("ZeroBounce queue loop started (interval=%ss)", _POLL_INTERVAL_S)
    while True:
        try:
            async with AsyncSessionLocal() as db:
                await try_promote(db)
        except asyncio.CancelledError:
            logger.info("ZeroBounce queue loop stopping")
            raise
        except Exception as exc:
            logger.error("ZeroBounce queue loop iteration failed: %s", exc)
        await asyncio.sleep(_POLL_INTERVAL_S)
