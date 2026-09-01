from __future__ import annotations

import uuid

from httpx import AsyncClient

from .conftest import WorkerController


async def _create(
    client: AsyncClient,
    data: bytes,
    name: str = "records.jsonl",
    job_name: str | None = None,
):
    params = {"enable_proxy": "false", "skip_duplicates": "true"}
    if job_name is not None:
        params["name"] = job_name
    return await client.post(
        "/jobs",
        files={"file": (name, data, "application/octet-stream")},
        params=params,
    )


# ── POST /jobs ────────────────────────────────────────────────────────────────


async def test_create_job_promotes_to_running(
    client: AsyncClient, sample_jsonl: bytes
) -> None:
    """An idle worker picks the job up immediately on submit."""
    response = await _create(client, sample_jsonl)

    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "RUNNING"
    assert data["input_filename"] == "records.jsonl"
    assert data["worker_session"] == f"job-{data['id']}"
    assert data["config"] == {"enable_proxy": False, "skip_duplicates": True}


async def test_create_job_queued_when_worker_busy(
    client: AsyncClient, worker: WorkerController, sample_jsonl: bytes
) -> None:
    """When the worker already has a run, the job stays queued."""
    worker.busy = True
    response = await _create(client, sample_jsonl)

    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "QUEUED"
    assert data["worker_session"] is None


async def test_create_job_dispatch_failure_marks_failed(
    client: AsyncClient, worker: WorkerController, sample_jsonl: bytes
) -> None:
    worker.trigger_error = RuntimeError("tmux launch failed")
    response = await _create(client, sample_jsonl)

    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "FAILED"
    assert "Dispatch failed" in data["error_message"]


async def test_create_job_invalid_extension(
    client: AsyncClient, sample_jsonl: bytes
) -> None:
    response = await _create(client, sample_jsonl, name="report.xlsx")
    assert response.status_code == 400
    assert "not allowed" in response.json()["detail"]


async def test_create_job_no_filename(client: AsyncClient, sample_jsonl: bytes) -> None:
    response = await client.post(
        "/jobs",
        files={"file": ("", sample_jsonl, "application/octet-stream")},
    )
    # FastAPI raises 422 before our handler runs when the filename is empty
    assert response.status_code in (400, 422)


async def test_create_job_uses_the_provided_name(
    client: AsyncClient, sample_jsonl: bytes
) -> None:
    response = await _create(client, sample_jsonl, job_name="Q3 outreach list")

    assert response.status_code == 201
    assert response.json()["name"] == "Q3 outreach list"


async def test_create_job_defaults_name_to_none_when_omitted(
    client: AsyncClient, sample_jsonl: bytes
) -> None:
    response = await _create(client, sample_jsonl)

    assert response.status_code == 201
    assert response.json()["name"] is None


async def test_create_job_treats_a_blank_name_as_none(
    client: AsyncClient, sample_jsonl: bytes
) -> None:
    response = await _create(client, sample_jsonl, job_name="   ")

    assert response.status_code == 201
    assert response.json()["name"] is None


# ── GET /jobs ─────────────────────────────────────────────────────────────────


async def test_list_jobs_empty(client: AsyncClient) -> None:
    response = await client.get("/jobs")
    assert response.status_code == 200
    data = response.json()
    assert data["jobs"] == []
    assert data["total"] == 0


async def test_list_jobs_returns_created(
    client: AsyncClient, sample_jsonl: bytes
) -> None:
    await _create(client, sample_jsonl)
    response = await client.get("/jobs")
    assert response.status_code == 200
    assert response.json()["total"] == 1


# ── GET /jobs/{id} ────────────────────────────────────────────────────────────


async def test_get_job_not_found(client: AsyncClient) -> None:
    response = await client.get(f"/jobs/{uuid.uuid4()}")
    assert response.status_code == 404


async def test_get_job_syncs_completion(
    client: AsyncClient, worker: WorkerController, sample_jsonl: bytes, tmp_path
) -> None:
    create_resp = await _create(client, sample_jsonl)
    job_id = create_resp.json()["id"]
    assert create_resp.json()["status"] == "RUNNING"

    # Pipeline finishes: worker reports COMPLETED on the next poll.
    worker.status = ("COMPLETED", None)
    response = await client.get(f"/jobs/{job_id}")
    assert response.status_code == 200
    assert response.json()["status"] == "COMPLETED"
    assert response.json()["output_file_key"] == f"outputs/{job_id}/result.csv"


# ── GET /jobs/{id}/logs ───────────────────────────────────────────────────────


async def test_get_logs_no_file(client: AsyncClient, sample_jsonl: bytes) -> None:
    create_resp = await _create(client, sample_jsonl)
    job_id = create_resp.json()["id"]

    response = await client.get(f"/jobs/{job_id}/logs")
    assert response.status_code == 200
    assert response.json()["lines"] == []


async def test_get_logs_with_content(
    client: AsyncClient, sample_jsonl: bytes, tmp_path
) -> None:
    create_resp = await _create(client, sample_jsonl)
    job_id = create_resp.json()["id"]

    log_path = tmp_path / "logs" / job_id / "run.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text("line one\nline two\nline three\n")

    response = await client.get(f"/jobs/{job_id}/logs")
    assert response.status_code == 200
    assert response.json()["lines"] == ["line one", "line two", "line three"]


# ── GET /jobs/{id}/download and /file ─────────────────────────────────────────


async def test_download_not_completed(client: AsyncClient, sample_jsonl: bytes) -> None:
    create_resp = await _create(client, sample_jsonl)
    job_id = create_resp.json()["id"]

    response = await client.get(f"/jobs/{job_id}/download")
    assert response.status_code == 409


async def test_download_file_not_completed(
    client: AsyncClient, sample_jsonl: bytes
) -> None:
    create_resp = await _create(client, sample_jsonl)
    job_id = create_resp.json()["id"]

    response = await client.get(f"/jobs/{job_id}/file")
    assert response.status_code == 409


async def test_download_file_streams_csv(
    client: AsyncClient, worker: WorkerController, sample_jsonl: bytes, tmp_path
) -> None:
    create_resp = await _create(client, sample_jsonl)
    job_id = create_resp.json()["id"]

    # Pipeline writes the output, then reports completion.
    out = tmp_path / "outputs" / job_id / "result.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("email,domain\nfoo@bar.com,bar.com\n")
    worker.status = ("COMPLETED", None)
    await client.get(f"/jobs/{job_id}")  # sync → COMPLETED

    response = await client.get(f"/jobs/{job_id}/file")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "foo@bar.com" in response.text


async def test_download_file_missing_output(
    client: AsyncClient, worker: WorkerController, sample_jsonl: bytes
) -> None:
    create_resp = await _create(client, sample_jsonl)
    job_id = create_resp.json()["id"]

    worker.status = ("COMPLETED", None)
    await client.get(f"/jobs/{job_id}")  # sync → COMPLETED, but no file written

    response = await client.get(f"/jobs/{job_id}/file")
    assert response.status_code == 404


# ── DELETE /jobs/{id} ─────────────────────────────────────────────────────────


async def test_cancel_queued_job(
    client: AsyncClient, worker: WorkerController, sample_jsonl: bytes
) -> None:
    worker.busy = True  # stays QUEUED (never dispatched)
    create_resp = await _create(client, sample_jsonl)
    job_id = create_resp.json()["id"]
    assert create_resp.json()["status"] == "QUEUED"

    response = await client.delete(f"/jobs/{job_id}")
    assert response.status_code == 204
    assert worker.cancelled == []  # queued job was never on the worker

    get_resp = await client.get(f"/jobs/{job_id}")
    assert get_resp.json()["status"] == "CANCELLED"


async def test_cancel_running_job_kills_session(
    client: AsyncClient, worker: WorkerController, sample_jsonl: bytes
) -> None:
    create_resp = await _create(client, sample_jsonl)
    job_id = create_resp.json()["id"]
    assert create_resp.json()["status"] == "RUNNING"

    response = await client.delete(f"/jobs/{job_id}")
    assert response.status_code == 204
    assert job_id in worker.cancelled

    get_resp = await client.get(f"/jobs/{job_id}")
    assert get_resp.json()["status"] == "CANCELLED"


async def test_cancel_nonexistent_job(client: AsyncClient) -> None:
    response = await client.delete(f"/jobs/{uuid.uuid4()}")
    assert response.status_code == 404


async def test_cancel_completed_job_rejected(
    client: AsyncClient, worker: WorkerController, sample_jsonl: bytes, tmp_path
) -> None:
    create_resp = await _create(client, sample_jsonl)
    job_id = create_resp.json()["id"]

    out = tmp_path / "outputs" / job_id / "result.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("done\n")
    worker.status = ("COMPLETED", None)
    await client.get(f"/jobs/{job_id}")  # sync → COMPLETED

    response = await client.delete(f"/jobs/{job_id}")
    assert response.status_code == 409
    assert "Cannot cancel" in response.json()["detail"]
