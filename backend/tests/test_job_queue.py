from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import Job
from backend.services import job_queue

from .conftest import PLACEHOLDER_USER_ID, TEST_VPS_ID, TEST_VPS_ID_2, WorkerController


async def _add_job(
    db: AsyncSession,
    status: str,
    session: str | None = None,
    vps_id: uuid.UUID = TEST_VPS_ID,
) -> Job:
    job = Job(
        id=uuid.uuid4(),
        user_id=PLACEHOLDER_USER_ID,
        vps_id=vps_id,
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


async def test_promote_dispatches_to_both_vps_in_one_call(
    db: AsyncSession, worker: WorkerController
) -> None:
    """Two QUEUED jobs on two different VPS both promote in a single try_promote()."""
    job_a = await _add_job(db, "QUEUED", vps_id=TEST_VPS_ID)
    job_b = await _add_job(db, "QUEUED", vps_id=TEST_VPS_ID_2)

    await job_queue.try_promote(db)

    assert await _status(db, job_a.id) == "RUNNING"
    assert await _status(db, job_b.id) == "RUNNING"


async def test_running_job_on_one_vps_does_not_block_another_vps(
    db: AsyncSession, worker: WorkerController
) -> None:
    await _add_job(db, "RUNNING", session="job-busy", vps_id=TEST_VPS_ID)
    queued_on_other_vps = await _add_job(db, "QUEUED", vps_id=TEST_VPS_ID_2)

    await job_queue.try_promote(db)

    assert await _status(db, queued_on_other_vps.id) == "RUNNING"


async def test_sync_running_job_updates_multiple_vps_at_once(
    db: AsyncSession, worker: WorkerController
) -> None:
    running_a = await _add_job(db, "RUNNING", session="job-a", vps_id=TEST_VPS_ID)
    running_b = await _add_job(db, "RUNNING", session="job-b", vps_id=TEST_VPS_ID_2)
    worker.status = ("COMPLETED", None)

    await job_queue.sync_running_job(db)

    assert await _status(db, running_a.id) == "COMPLETED"
    assert await _status(db, running_b.id) == "COMPLETED"


async def test_promote_pushes_input_before_dispatch_on_remote_vps(
    db: AsyncSession, worker: WorkerController, monkeypatch, remote_vps_id
) -> None:
    """Remote VPS: the input file is SFTP-pushed as part of promotion, not job creation."""
    calls: list[str] = []

    async def fake_push(vps, job_id, file_key, filename) -> None:
        calls.append(str(job_id))

    monkeypatch.setattr("backend.services.job_queue.push_input", fake_push)
    queued = await _add_job(db, "QUEUED", vps_id=remote_vps_id)

    await job_queue.try_promote(db)

    assert calls == [str(queued.id)]
    assert await _status(db, queued.id) == "RUNNING"


async def test_promote_marks_failed_when_push_fails(
    db: AsyncSession, worker: WorkerController, monkeypatch, remote_vps_id
) -> None:
    async def fake_push(vps, job_id, file_key, filename) -> None:
        raise RuntimeError("SSH push to host:path failed: connection refused")

    monkeypatch.setattr("backend.services.job_queue.push_input", fake_push)
    queued = await _add_job(db, "QUEUED", vps_id=remote_vps_id)

    await job_queue.try_promote(db)

    assert await _status(db, queued.id) == "FAILED"
    result = await db.execute(select(Job.error_message).where(Job.id == queued.id))
    assert "Dispatch failed" in result.scalar_one()


async def test_promote_skips_push_on_local_vps(
    db: AsyncSession, worker: WorkerController, monkeypatch
) -> None:
    """Local VPS: no SFTP push is attempted."""
    calls: list[str] = []

    async def fake_push(vps, job_id, file_key, filename) -> None:
        calls.append(str(job_id))

    monkeypatch.setattr("backend.services.job_queue.push_input", fake_push)
    queued = await _add_job(db, "QUEUED", vps_id=TEST_VPS_ID)

    await job_queue.try_promote(db)

    assert calls == []
    assert await _status(db, queued.id) == "RUNNING"
