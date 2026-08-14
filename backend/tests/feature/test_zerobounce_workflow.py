"""
Feature test — the ZeroBounce runner's full processing loop.

Real PostgreSQL and real filesystem I/O (tmp_path); only the outbound
ZeroBounce HTTP calls are mocked, matching this project's feature-test
convention (mock the external service, not storage or the database).
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.models import ZeroBounceJob
from backend.services import zerobounce_runner


@pytest.fixture
def session_factory(engine):
    return async_sessionmaker(engine, expire_on_commit=False)


async def _seed_job(db, **overrides) -> uuid.UUID:
    job_id = uuid.uuid4()
    fields = {
        "id": job_id,
        "status": "QUEUED",
        "input_filename": "emails.csv",
        "filter_mode": "all",
        "email_col": "email",
        **overrides,
    }
    db.add(ZeroBounceJob(**fields))
    await db.commit()
    return job_id


@pytest.mark.feature
async def test_run_zerobounce_writes_output_and_marks_completed(
    db, session_factory, tmp_path, monkeypatch
) -> None:
    monkeypatch.setenv("ZEROBOUNCE_API_KEY", "test-key")
    monkeypatch.setattr(
        zerobounce_runner, "_get_credits", _fake_get_credits(credits=10)
    )
    monkeypatch.setattr(zerobounce_runner, "_validate_one", _fake_validate_one)

    job_id = await _seed_job(db)
    input_path = tmp_path / "emails.csv"
    input_path.write_text("email,name\na@example.com,Alice\nb@example.com,Bob\n")
    output_path = tmp_path / "output.csv"

    await zerobounce_runner.run_zerobounce(
        job_id=job_id,
        input_path=input_path,
        output_path=output_path,
        email_col="email",
        session_factory=session_factory,
    )

    result = await db.execute(select(ZeroBounceJob).where(ZeroBounceJob.id == job_id))
    job = result.scalar_one()
    assert job.status == "COMPLETED"
    assert job.processed_count == 2

    output_lines = output_path.read_text().splitlines()
    assert len(output_lines) == 3  # header + 2 rows
    assert "zb_status" in output_lines[0]


@pytest.mark.feature
async def test_run_zerobounce_fails_when_column_missing(
    db, session_factory, tmp_path, monkeypatch
) -> None:
    monkeypatch.setenv("ZEROBOUNCE_API_KEY", "test-key")

    job_id = await _seed_job(db)
    input_path = tmp_path / "emails.csv"
    input_path.write_text("not_email,name\na@example.com,Alice\n")
    output_path = tmp_path / "output.csv"

    await zerobounce_runner.run_zerobounce(
        job_id=job_id,
        input_path=input_path,
        output_path=output_path,
        email_col="email",
        session_factory=session_factory,
    )

    result = await db.execute(select(ZeroBounceJob).where(ZeroBounceJob.id == job_id))
    job = result.scalar_one()
    assert job.status == "FAILED"
    assert "not found" in job.error_message


@pytest.mark.feature
async def test_run_zerobounce_fails_when_insufficient_credits(
    db, session_factory, tmp_path, monkeypatch
) -> None:
    monkeypatch.setenv("ZEROBOUNCE_API_KEY", "test-key")
    monkeypatch.setattr(zerobounce_runner, "_get_credits", _fake_get_credits(credits=0))

    job_id = await _seed_job(db)
    input_path = tmp_path / "emails.csv"
    input_path.write_text("email\na@example.com\n")
    output_path = tmp_path / "output.csv"

    await zerobounce_runner.run_zerobounce(
        job_id=job_id,
        input_path=input_path,
        output_path=output_path,
        email_col="email",
        session_factory=session_factory,
    )

    result = await db.execute(select(ZeroBounceJob).where(ZeroBounceJob.id == job_id))
    job = result.scalar_one()
    assert job.status == "FAILED"
    assert "credits" in job.error_message


def _fake_get_credits(credits: int):
    async def _fake(session, api_key: str) -> int:
        return credits

    return _fake


async def _fake_validate_one(session, sem, api_key: str, email: str) -> dict[str, str]:
    return {
        "zb_status": "valid",
        "zb_sub_status": "",
        "zb_free_email": "false",
        "zb_did_you_mean": "",
        "zb_smtp_provider": "",
        "zb_mx_found": "true",
        "zb_mx_record": "",
    }
