"""
Feature tests, full job workflow through the FastAPI stack.

These tests exercise the complete request lifecycle with:
  - Real PostgreSQL (scraper_test database)
  - Real local filesystem storage (tmp_path)
  - The worker VPS (SSH/tmux) mocked via the FakeWorker fixture in conftest

They differ from unit tests by not mocking the storage layer and by
verifying that file I/O, database state, and HTTP responses are consistent
across the full create → status → logs → download sequence.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from ..conftest import WorkerController

SAMPLE_JSONL = (
    b'{"unique_id":"F001","business_name":"Acme Corp","agent_name":"John","state":"FL"}\n'
    b'{"unique_id":"F002","business_name":"Beta LLC","agent_name":"Jane","state":"TX"}\n'
)


@pytest.mark.feature
async def test_full_create_and_retrieve_workflow(
    client: AsyncClient,
    worker: WorkerController,
    tmp_path,
) -> None:
    """Upload → job dispatched → status retrievable → appears in list."""
    create_resp = await client.post(
        "/jobs",
        files={"file": ("records.jsonl", SAMPLE_JSONL, "application/octet-stream")},
        params={"enable_proxy": "false", "skip_duplicates": "true"},
    )
    assert create_resp.status_code == 201
    job = create_resp.json()
    job_id = job["id"]

    assert job["status"] == "RUNNING"
    assert job["worker_session"] == f"job-{job_id}"
    assert job["input_filename"] == "records.jsonl"
    assert job["config"] == {"enable_proxy": False, "skip_duplicates": True}

    # Uploaded file exists on disk (local VPS → no SFTP push)
    stored = tmp_path / "inputs" / job_id / "records.jsonl"
    assert stored.exists()
    assert stored.read_bytes() == SAMPLE_JSONL

    # Job is retrievable via GET and still RUNNING
    get_resp = await client.get(f"/jobs/{job_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["status"] == "RUNNING"

    # Job appears in list
    list_resp = await client.get("/jobs")
    assert list_resp.status_code == 200
    ids = [j["id"] for j in list_resp.json()["jobs"]]
    assert job_id in ids


@pytest.mark.feature
async def test_download_only_available_when_completed(
    client: AsyncClient,
    worker: WorkerController,
    tmp_path,
) -> None:
    """Download endpoint is 409 while running, available once output exists."""
    create_resp = await client.post(
        "/jobs",
        files={"file": ("records.jsonl", SAMPLE_JSONL, "application/octet-stream")},
    )
    job_id = create_resp.json()["id"]

    # Still RUNNING, download unavailable
    download_resp = await client.get(f"/jobs/{job_id}/download")
    assert download_resp.status_code == 409

    # Simulate completion: pipeline writes output and reports COMPLETED
    output = tmp_path / "outputs" / job_id / "result.csv"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("email,domain\nfoo@bar.com,bar.com\n")
    worker.status = ("COMPLETED", None)
    await client.get(f"/jobs/{job_id}")  # triggers status sync → COMPLETED

    # Now download is available
    dl_resp = await client.get(f"/jobs/{job_id}/download")
    assert dl_resp.status_code == 200
    assert f"/jobs/{job_id}/file" in dl_resp.json()["url"]

    # File endpoint streams the CSV
    file_resp = await client.get(f"/jobs/{job_id}/file")
    assert file_resp.status_code == 200
    assert "text/csv" in file_resp.headers["content-type"]
    assert b"foo@bar.com" in file_resp.content


@pytest.mark.feature
async def test_logs_served_from_filesystem(
    client: AsyncClient,
    tmp_path,
) -> None:
    """Log lines written by the pipeline are served to the dashboard."""
    create_resp = await client.post(
        "/jobs",
        files={"file": ("records.jsonl", SAMPLE_JSONL, "application/octet-stream")},
    )
    job_id = create_resp.json()["id"]

    log_file = tmp_path / "logs" / job_id / "run.log"
    log_file.parent.mkdir(parents=True, exist_ok=True)
    log_file.write_text(
        "[2026-05-15T00:00:01Z] INFO starting\n"
        "[2026-05-15T00:00:02Z] INFO processed 100 records\n"
        "[2026-05-15T00:00:03Z] INFO done\n"
    )

    logs_resp = await client.get(f"/jobs/{job_id}/logs")
    assert logs_resp.status_code == 200
    lines = logs_resp.json()["lines"]
    assert len(lines) == 3
    assert "processed 100 records" in lines[1]


@pytest.mark.feature
async def test_second_job_queues_behind_running(
    client: AsyncClient,
    worker: WorkerController,
) -> None:
    """Only one job runs at a time; the second stays QUEUED until the first ends."""
    first = await client.post(
        "/jobs",
        files={"file": ("a.jsonl", SAMPLE_JSONL, "application/octet-stream")},
    )
    assert first.json()["status"] == "RUNNING"

    second = await client.post(
        "/jobs",
        files={"file": ("b.jsonl", SAMPLE_JSONL, "application/octet-stream")},
    )
    assert second.json()["status"] == "QUEUED"
    assert second.json()["worker_session"] is None

    # First completes → the poll on GET marks it done and promotes the second job.
    first_id = first.json()["id"]
    worker.status = ("COMPLETED", None)
    first_done = await client.get(f"/jobs/{first_id}")
    assert first_done.json()["status"] == "COMPLETED"

    # The now-running second job reports RUNNING on its own poll.
    worker.status = ("RUNNING", None)
    second_id = second.json()["id"]
    promoted = await client.get(f"/jobs/{second_id}")
    assert promoted.json()["status"] == "RUNNING"
    assert promoted.json()["worker_session"] == f"job-{second_id}"


@pytest.mark.feature
async def test_server_side_file_size_limit(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Server must reject files over the configured limit regardless of client-side validation."""
    monkeypatch.setattr("backend.routers.jobs._MAX_UPLOAD_BYTES", 100 * 1024 * 1024)
    big_file = b"x" * (101 * 1024 * 1024)
    resp = await client.post(
        "/jobs",
        files={"file": ("big.jsonl", big_file, "application/octet-stream")},
    )
    assert resp.status_code == 413
