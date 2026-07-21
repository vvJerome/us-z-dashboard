from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import Job
from backend.services import job_queue

from .conftest import PLACEHOLDER_USER_ID, TEST_VPS_ID, WorkerController


async def _add_job(db: AsyncSession, status: str, session: str | None = None) -> Job:
    job = Job(
        id=uuid.uuid4(),
        user_id=PLACEHOLDER_USER_ID,
        vps_id=TEST_VPS_ID,
        status=status,
        input_filename="in.jsonl",
        input_file_key=f"inputs/{uuid.uuid4()}/in.jsonl",
        config={"enable_proxy": False, "skip_duplicates": True},
        worker_session=session,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


async def _status(db: AsyncSession, job_id) -> str:
    result = await db.execute(select(Job.status).where(Job.id == job_id))
    return result.scalar_one()


async def test_promote_picks_oldest_queued(
    db: AsyncSession, worker: WorkerController
) -> None:
    first = await _add_job(db, "QUEUED")
    await _add_job(db, "QUEUED")

    await job_queue.try_promote(db)

    assert await _status(db, first.id) == "RUNNING"
    result = await db.execute(select(Job.worker_session).where(Job.id == first.id))
    assert result.scalar_one() == f"job-{first.id}"


async def test_promote_noop_when_running_exists(
    db: AsyncSession, worker: WorkerController
) -> None:
    await _add_job(db, "RUNNING", session="job-x")
    queued = await _add_job(db, "QUEUED")

    await job_queue.try_promote(db)

    assert await _status(db, queued.id) == "QUEUED"


async def test_promote_skips_when_worker_busy(
    db: AsyncSession, worker: WorkerController
) -> None:
    worker.busy = True
    queued = await _add_job(db, "QUEUED")

    await job_queue.try_promote(db)

    assert await _status(db, queued.id) == "QUEUED"


async def test_promote_marks_failed_on_dispatch_error(
    db: AsyncSession, worker: WorkerController
) -> None:
    worker.trigger_error = RuntimeError("ssh down")
    queued = await _add_job(db, "QUEUED")

    await job_queue.try_promote(db)

    assert await _status(db, queued.id) == "FAILED"
    result = await db.execute(select(Job.error_message).where(Job.id == queued.id))
    assert "Dispatch failed" in result.scalar_one()


async def test_sync_running_job_completes(
    db: AsyncSession, worker: WorkerController
) -> None:
    running = await _add_job(db, "RUNNING", session="job-y")
    worker.status = ("COMPLETED", None)

    await job_queue.sync_running_job(db)

    assert await _status(db, running.id) == "COMPLETED"
    result = await db.execute(select(Job.output_file_key).where(Job.id == running.id))
    assert result.scalar_one() == f"outputs/{running.id}/result.csv"


async def test_sync_running_job_records_failure(
    db: AsyncSession, worker: WorkerController
) -> None:
    running = await _add_job(db, "RUNNING", session="job-z")
    worker.status = ("FAILED", "pipeline exited with code 1")

    await job_queue.sync_running_job(db)

    assert await _status(db, running.id) == "FAILED"
    result = await db.execute(select(Job.error_message).where(Job.id == running.id))
    assert result.scalar_one() == "pipeline exited with code 1"
