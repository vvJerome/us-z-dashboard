from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import ZeroBounceJob


async def _make_zb_job(db: AsyncSession, **overrides) -> ZeroBounceJob:
    fields = {
        "id": uuid.uuid4(),
        "status": "QUEUED",
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


@pytest.fixture(autouse=True)
def no_zerobounce_run(monkeypatch):
    """Don't actually kick off the background runner during these tests."""

    async def _noop(**kwargs):
        return None

    monkeypatch.setattr(
        "backend.services.zerobounce_queue.zerobounce_runner.run_zerobounce", _noop
    )


class TestCreateZeroBounceJob:
    async def test_rejects_disallowed_extension(self, client: AsyncClient) -> None:
        resp = await client.post(
            "/zerobounce",
            files={"file": ("emails.pdf", b"a,b\n1,2", "application/pdf")},
        )
        assert resp.status_code == 400

    async def test_rejects_file_over_size_limit(self, client: AsyncClient) -> None:
        big = b"a" * (100 * 1024 * 1024 + 1)
        resp = await client.post(
            "/zerobounce",
            files={"file": ("emails.csv", big, "text/csv")},
        )
        assert resp.status_code == 413

    async def test_rejects_path_traversal_in_filename(
        self, client: AsyncClient
    ) -> None:
        resp = await client.post(
            "/zerobounce",
            files={"file": ("../../evil.csv", b"a,b\n1,2", "text/csv")},
        )
        assert resp.status_code == 400

    async def test_rejected_upload_leaves_no_directory_behind(
        self, client: AsyncClient, tmp_path
    ) -> None:
        """Regression test: the job_id directory used to get mkdir'd before
        the filename was validated, leaving an empty directory on disk for
        every rejected (e.g. path-traversal) upload attempt."""
        before = (
            set((tmp_path / "zerobounce").iterdir())
            if (tmp_path / "zerobounce").exists()
            else set()
        )

        resp = await client.post(
            "/zerobounce",
            files={"file": ("../../evil.csv", b"a,b\n1,2", "text/csv")},
        )
        assert resp.status_code == 400

        after = (
            set((tmp_path / "zerobounce").iterdir())
            if (tmp_path / "zerobounce").exists()
            else set()
        )
        assert after == before

    async def test_accepts_valid_csv_and_promotes_immediately(
        self, client: AsyncClient
    ) -> None:
        """No other job is queued, so try_promote flips it straight to RUNNING
        (synchronously, before the response is returned)."""
        resp = await client.post(
            "/zerobounce",
            files={"file": ("emails.csv", b"email\nfoo@bar.com", "text/csv")},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "RUNNING"
        assert body["input_filename"] == "emails.csv"

    async def test_accepts_jsonl_extension(self, client: AsyncClient) -> None:
        resp = await client.post(
            "/zerobounce",
            files={"file": ("emails.jsonl", b'{"email":"a@b.com"}', "text/plain")},
        )
        assert resp.status_code == 200


class TestListAndGetZeroBounceJobs:
    async def test_list_returns_created_jobs(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        await _make_zb_job(db)
        resp = await client.get("/zerobounce")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    async def test_get_by_id(self, client: AsyncClient, db: AsyncSession) -> None:
        job = await _make_zb_job(db)
        resp = await client.get(f"/zerobounce/{job.id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == str(job.id)

    async def test_get_not_found(self, client: AsyncClient) -> None:
        resp = await client.get(f"/zerobounce/{uuid.uuid4()}")
        assert resp.status_code == 404


class TestDownloadZeroBounceResult:
    async def test_download_not_found(self, client: AsyncClient) -> None:
        resp = await client.get(f"/zerobounce/{uuid.uuid4()}/download")
        assert resp.status_code == 404

    async def test_download_not_ready_while_queued(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        job = await _make_zb_job(db, status="QUEUED")
        resp = await client.get(f"/zerobounce/{job.id}/download")
        assert resp.status_code == 409

    async def test_download_missing_output_file(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        job = await _make_zb_job(
            db, status="COMPLETED", output_file_key="zerobounce/missing/output.csv"
        )
        resp = await client.get(f"/zerobounce/{job.id}/download")
        assert resp.status_code == 404
