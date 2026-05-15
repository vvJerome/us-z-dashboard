from __future__ import annotations

import uuid

from httpx import AsyncClient
from pytest_httpx import HTTPXMock


KESTRA_TRIGGER_URL = (
    "http://kestra-mock:8080/api/v1/executions/webhook/prod/run-scraper/test-key"
)


# ── POST /jobs ────────────────────────────────────────────────────────────────


async def test_create_job_success(
    client: AsyncClient, httpx_mock: HTTPXMock, sample_jsonl: bytes
) -> None:
    httpx_mock.add_response(
        url=KESTRA_TRIGGER_URL, json={"id": "exec-abc"}, status_code=200
    )

    response = await client.post(
        "/jobs",
        files={"file": ("records.jsonl", sample_jsonl, "application/octet-stream")},
        params={"enable_proxy": "false", "skip_duplicates": "true"},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "QUEUED"
    assert data["input_filename"] == "records.jsonl"
    assert data["kestra_execution_id"] == "exec-abc"
    assert data["config"] == {"enable_proxy": False, "skip_duplicates": True}


async def test_create_job_invalid_extension(
    client: AsyncClient, sample_jsonl: bytes
) -> None:
    response = await client.post(
        "/jobs",
        files={"file": ("report.xlsx", sample_jsonl, "application/octet-stream")},
    )
    assert response.status_code == 400
    assert "not allowed" in response.json()["detail"]


async def test_create_job_no_filename(client: AsyncClient, sample_jsonl: bytes) -> None:
    response = await client.post(
        "/jobs",
        files={"file": ("", sample_jsonl, "application/octet-stream")},
    )
    # FastAPI raises 422 (framework validation) before our handler runs when filename is empty
    assert response.status_code in (400, 422)


async def test_create_job_kestra_failure(
    client: AsyncClient, httpx_mock: HTTPXMock, sample_jsonl: bytes
) -> None:
    httpx_mock.add_response(url=KESTRA_TRIGGER_URL, status_code=500)

    response = await client.post(
        "/jobs",
        files={"file": ("records.jsonl", sample_jsonl, "application/octet-stream")},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "FAILED"
    assert "Kestra" in data["error_message"]


# ── GET /jobs ─────────────────────────────────────────────────────────────────


async def test_list_jobs_empty(client: AsyncClient) -> None:
    response = await client.get("/jobs")
    assert response.status_code == 200
    data = response.json()
    assert data["jobs"] == []
    assert data["total"] == 0


async def test_list_jobs_returns_created(
    client: AsyncClient, httpx_mock: HTTPXMock, sample_jsonl: bytes
) -> None:
    httpx_mock.add_response(url=KESTRA_TRIGGER_URL, json={"id": "exec-001"})
    await client.post(
        "/jobs", files={"file": ("r.jsonl", sample_jsonl, "application/octet-stream")}
    )

    response = await client.get("/jobs")
    assert response.status_code == 200
    assert response.json()["total"] == 1


# ── GET /jobs/{id} ────────────────────────────────────────────────────────────


async def test_get_job_not_found(client: AsyncClient) -> None:
    response = await client.get(f"/jobs/{uuid.uuid4()}")
    assert response.status_code == 404


async def test_get_job_syncs_running_status(
    client: AsyncClient, httpx_mock: HTTPXMock, sample_jsonl: bytes
) -> None:
    httpx_mock.add_response(url=KESTRA_TRIGGER_URL, json={"id": "exec-sync"})
    create_resp = await client.post(
        "/jobs", files={"file": ("r.jsonl", sample_jsonl, "application/octet-stream")}
    )
    job_id = create_resp.json()["id"]

    httpx_mock.add_response(
        url="http://kestra-mock:8080/api/v1/executions/exec-sync",
        json={"state": {"current": "RUNNING"}},
    )

    response = await client.get(f"/jobs/{job_id}")
    assert response.status_code == 200
    assert response.json()["status"] == "RUNNING"


# ── GET /jobs/{id}/logs ───────────────────────────────────────────────────────


async def test_get_logs_no_file(
    client: AsyncClient, httpx_mock: HTTPXMock, sample_jsonl: bytes
) -> None:
    httpx_mock.add_response(url=KESTRA_TRIGGER_URL, json={"id": "exec-log"})
    create_resp = await client.post(
        "/jobs", files={"file": ("r.jsonl", sample_jsonl, "application/octet-stream")}
    )
    job_id = create_resp.json()["id"]

    response = await client.get(f"/jobs/{job_id}/logs")
    assert response.status_code == 200
    assert response.json()["lines"] == []


async def test_get_logs_with_content(
    client: AsyncClient, httpx_mock: HTTPXMock, sample_jsonl: bytes, tmp_path
) -> None:
    httpx_mock.add_response(url=KESTRA_TRIGGER_URL, json={"id": "exec-log2"})
    create_resp = await client.post(
        "/jobs", files={"file": ("r.jsonl", sample_jsonl, "application/octet-stream")}
    )
    job_id = create_resp.json()["id"]

    log_path = tmp_path / "logs" / job_id / "run.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text("line one\nline two\nline three\n")

    response = await client.get(f"/jobs/{job_id}/logs")
    assert response.status_code == 200
    assert response.json()["lines"] == ["line one", "line two", "line three"]


# ── GET /jobs/{id}/download ───────────────────────────────────────────────────


async def test_download_not_completed(
    client: AsyncClient, httpx_mock: HTTPXMock, sample_jsonl: bytes
) -> None:
    httpx_mock.add_response(url=KESTRA_TRIGGER_URL, json={"id": "exec-dl"})
    create_resp = await client.post(
        "/jobs", files={"file": ("r.jsonl", sample_jsonl, "application/octet-stream")}
    )
    job_id = create_resp.json()["id"]

    response = await client.get(f"/jobs/{job_id}/download")
    assert response.status_code == 409


# ── GET /jobs/{id}/file ──────────────────────────────────────────────────────


async def test_download_file_not_completed(
    client: AsyncClient, httpx_mock: HTTPXMock, sample_jsonl: bytes
) -> None:
    httpx_mock.add_response(url=KESTRA_TRIGGER_URL, json={"id": "exec-file1"})
    create_resp = await client.post(
        "/jobs", files={"file": ("r.jsonl", sample_jsonl, "application/octet-stream")}
    )
    job_id = create_resp.json()["id"]

    response = await client.get(f"/jobs/{job_id}/file")
    assert response.status_code == 409


async def test_download_file_streams_csv(
    client: AsyncClient, httpx_mock: HTTPXMock, sample_jsonl: bytes, tmp_path
) -> None:
    httpx_mock.add_response(url=KESTRA_TRIGGER_URL, json={"id": "exec-file2"})
    create_resp = await client.post(
        "/jobs", files={"file": ("r.jsonl", sample_jsonl, "application/octet-stream")}
    )
    job_id = create_resp.json()["id"]

    # Simulate pipeline writing output and Kestra completing the job
    out = tmp_path / "outputs" / job_id / "result.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("email,domain\nfoo@bar.com,bar.com\n")

    httpx_mock.add_response(
        url=f"http://kestra-mock:8080/api/v1/executions/exec-file2",
        json={"state": {"current": "SUCCESS"}},
    )
    await client.get(f"/jobs/{job_id}")  # sync status → COMPLETED

    response = await client.get(f"/jobs/{job_id}/file")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "foo@bar.com" in response.text


async def test_download_file_missing_output(
    client: AsyncClient, httpx_mock: HTTPXMock, sample_jsonl: bytes
) -> None:
    httpx_mock.add_response(url=KESTRA_TRIGGER_URL, json={"id": "exec-file3"})
    create_resp = await client.post(
        "/jobs", files={"file": ("r.jsonl", sample_jsonl, "application/octet-stream")}
    )
    job_id = create_resp.json()["id"]

    httpx_mock.add_response(
        url=f"http://kestra-mock:8080/api/v1/executions/exec-file3",
        json={"state": {"current": "SUCCESS"}},
    )
    await client.get(f"/jobs/{job_id}")  # sync status → COMPLETED, but no file written

    response = await client.get(f"/jobs/{job_id}/file")
    assert response.status_code == 404


# ── DELETE /jobs/{id} ─────────────────────────────────────────────────────────


async def test_cancel_queued_job(
    client: AsyncClient, httpx_mock: HTTPXMock, sample_jsonl: bytes
) -> None:
    httpx_mock.add_response(url=KESTRA_TRIGGER_URL, json={"id": "exec-cancel"})
    create_resp = await client.post(
        "/jobs", files={"file": ("r.jsonl", sample_jsonl, "application/octet-stream")}
    )
    job_id = create_resp.json()["id"]

    httpx_mock.add_response(
        url="http://kestra-mock:8080/api/v1/executions/exec-cancel/kill",
        status_code=204,
    )

    response = await client.delete(f"/jobs/{job_id}")
    assert response.status_code == 204

    # _sync_status skips Kestra when status is already CANCELLED — no mock needed
    get_resp = await client.get(f"/jobs/{job_id}")
    assert get_resp.json()["status"] == "CANCELLED"


async def test_cancel_nonexistent_job(client: AsyncClient) -> None:
    response = await client.delete(f"/jobs/{uuid.uuid4()}")
    assert response.status_code == 404


async def test_cancel_completed_job_rejected(
    client: AsyncClient, httpx_mock: HTTPXMock, sample_jsonl: bytes, tmp_path
) -> None:
    httpx_mock.add_response(url=KESTRA_TRIGGER_URL, json={"id": "exec-cancel2"})
    create_resp = await client.post(
        "/jobs", files={"file": ("r.jsonl", sample_jsonl, "application/octet-stream")}
    )
    job_id = create_resp.json()["id"]

    out = tmp_path / "outputs" / job_id / "result.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("done\n")

    httpx_mock.add_response(
        url=f"http://kestra-mock:8080/api/v1/executions/exec-cancel2",
        json={"state": {"current": "SUCCESS"}},
    )
    await client.get(f"/jobs/{job_id}")  # sync → COMPLETED

    response = await client.delete(f"/jobs/{job_id}")
    assert response.status_code == 409
    assert "Cannot cancel" in response.json()["detail"]
