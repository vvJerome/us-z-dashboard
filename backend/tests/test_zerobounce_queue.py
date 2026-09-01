from __future__ import annotations

import asyncio
import uuid
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import ZeroBounceJob
from backend.services import zerobounce_queue


async def _add_job(db: AsyncSession, status: str, **overrides) -> ZeroBounceJob:
    fields = {
        "id": uuid.uuid4(),
        "status": status,
        "input_filename": "emails.csv",
        "filter_mode": "all",
        "email_col": "email",
        **overrides,
    }
    job = ZeroBounceJob(**fields)
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


async def _status(db: AsyncSession, job_id: uuid.UUID) -> str:
    result = await db.execute(
        select(ZeroBounceJob.status).where(ZeroBounceJob.id == job_id)
    )
    return result.scalar_one()


@pytest.fixture
def captured_runs(monkeypatch):
    """Replace run_zerobounce with a recorder, no real HTTP calls, no DB writes."""
    calls: list[dict] = []

    async def _fake(**kwargs):
        calls.append(kwargs)

    monkeypatch.setattr(zerobounce_queue.zerobounce_runner, "run_zerobounce", _fake)
    return calls


async def test_promote_dispatches_oldest_queued(
    db: AsyncSession, captured_runs: list[dict], tmp_path: Path
) -> None:
    first = await _add_job(db, "QUEUED")
    await _add_job(db, "QUEUED")

    await zerobounce_queue.try_promote(db, tmp_path)
    await asyncio.sleep(0)  # let the created task run

    assert len(captured_runs) == 1
    assert captured_runs[0]["job_id"] == first.id
    assert (
        captured_runs[0]["input_path"]
        == tmp_path / "zerobounce" / str(first.id) / "emails.csv"
    )


async def test_promote_marks_the_job_running_before_returning(
    db: AsyncSession, captured_runs: list[dict], tmp_path: Path
) -> None:
    """Regression test: try_promote used to release its lock and return
    right after asyncio.create_task(), before the dispatched task had run
    even one line, so the DB still showed the job as QUEUED. A second
    try_promote call (another request, or the next queue_loop tick) would
    then see "no RUNNING job" and dispatch a second one on top of it,
    running two ZeroBounce jobs in parallel despite the single-flight design.
    Reproduced against a live server under real concurrent HTTP load before
    being fixed here, try_promote must write RUNNING synchronously, inside
    the lock, before the background task is even created."""
    job = await _add_job(db, "QUEUED")

    await zerobounce_queue.try_promote(db, tmp_path)

    assert await _status(db, job.id) == "RUNNING"


async def test_second_promote_call_is_a_noop_while_the_first_is_still_in_flight(
    db: AsyncSession, captured_runs: list[dict], tmp_path: Path
) -> None:
    """The scenario that broke live: two try_promote calls in quick
    succession (e.g. two concurrent HTTP requests) must not both dispatch —
    the second must see the first's job as RUNNING and no-op."""
    first = await _add_job(db, "QUEUED")
    second = await _add_job(db, "QUEUED")

    await zerobounce_queue.try_promote(db, tmp_path)
    await zerobounce_queue.try_promote(db, tmp_path)

    assert len(captured_runs) == 1
    assert captured_runs[0]["job_id"] == first.id
    assert await _status(db, second.id) == "QUEUED"


async def test_promote_noop_when_running_exists(
    db: AsyncSession, captured_runs: list[dict], tmp_path: Path
) -> None:
    await _add_job(db, "RUNNING")
    await _add_job(db, "QUEUED")

    await zerobounce_queue.try_promote(db, tmp_path)
    await asyncio.sleep(0)

    assert captured_runs == []


async def test_promote_noop_when_nothing_queued(
    db: AsyncSession, captured_runs: list[dict], tmp_path: Path
) -> None:
    await _add_job(db, "COMPLETED")

    await zerobounce_queue.try_promote(db, tmp_path)
    await asyncio.sleep(0)

    assert captured_runs == []


async def test_promote_holds_a_reference_to_the_dispatched_task(
    db: AsyncSession, captured_runs: list[dict], tmp_path: Path
) -> None:
    """asyncio only weak-references tasks, an unreferenced task can be
    garbage collected mid-run. try_promote must keep a strong reference for
    the task's lifetime, exposed as the module-level _active_task slot."""
    await _add_job(db, "QUEUED")

    await zerobounce_queue.try_promote(db, tmp_path)

    assert zerobounce_queue._active_task is not None
    assert not zerobounce_queue._active_task.done()

    await zerobounce_queue._active_task

    assert zerobounce_queue._active_task is None


async def test_reconcile_orphaned_marks_running_as_failed(db: AsyncSession) -> None:
    job = await _add_job(db, "RUNNING")

    await zerobounce_queue.reconcile_orphaned(db)

    assert await _status(db, job.id) == "FAILED"


async def test_reconcile_orphaned_leaves_other_statuses_untouched(
    db: AsyncSession,
) -> None:
    queued = await _add_job(db, "QUEUED")
    completed = await _add_job(db, "COMPLETED")

    await zerobounce_queue.reconcile_orphaned(db)

    assert await _status(db, queued.id) == "QUEUED"
    assert await _status(db, completed.id) == "COMPLETED"
