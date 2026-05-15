from __future__ import annotations

import json
import uuid

import pytest
from pytest_httpx import HTTPXMock

from backend.services.kestra import KestraClient, _KESTRA_STATE_MAP

BASE = "http://kestra:8080"
KEY = "webhook-secret"
EXECUTION_ID = "exec-test-123"


@pytest.fixture
def kestra() -> KestraClient:
    return KestraClient(BASE, KEY)


# ── trigger ───────────────────────────────────────────────────────────────────


async def test_trigger_returns_execution_id(
    kestra: KestraClient, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(
        url=f"{BASE}/api/v1/executions/webhook/prod/run-scraper/{KEY}",
        json={"id": EXECUTION_ID},
        status_code=200,
    )

    from backend.schemas.jobs import JobConfig

    config = JobConfig(enable_proxy=False, skip_duplicates=True)
    result = await kestra.trigger(uuid.uuid4(), "inputs/abc/input.jsonl", config)
    assert result == EXECUTION_ID


async def test_trigger_passes_correct_payload(
    kestra: KestraClient, httpx_mock: HTTPXMock
) -> None:
    job_id = uuid.uuid4()
    file_key = "inputs/abc/input.jsonl"
    captured: list[dict] = []

    def capture(request, **kwargs):
        captured.append(json.loads(request.content))
        from httpx import Response

        return Response(200, json={"id": "exec-xyz"})

    httpx_mock.add_callback(capture)

    from backend.schemas.jobs import JobConfig

    await kestra.trigger(
        job_id, file_key, JobConfig(enable_proxy=True, skip_duplicates=False)
    )

    assert captured[0]["job_id"] == str(job_id)
    assert captured[0]["input_file_key"] == file_key
    config_parsed = json.loads(captured[0]["config"])
    assert config_parsed["enable_proxy"] is True
    assert config_parsed["skip_duplicates"] is False


# ── get_status ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("kestra_state,expected", list(_KESTRA_STATE_MAP.items()))
async def test_get_status_maps_all_states(
    kestra: KestraClient, httpx_mock: HTTPXMock, kestra_state: str, expected: str
) -> None:
    httpx_mock.add_response(
        url=f"{BASE}/api/v1/executions/{EXECUTION_ID}",
        json={"state": {"current": kestra_state}},
    )
    result = await kestra.get_status(EXECUTION_ID)
    assert result == expected


async def test_get_status_unknown_state_returns_running(
    kestra: KestraClient, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(
        url=f"{BASE}/api/v1/executions/{EXECUTION_ID}",
        json={"state": {"current": "SOME_UNKNOWN_STATE"}},
    )
    result = await kestra.get_status(EXECUTION_ID)
    assert result == "RUNNING"


async def test_get_status_404_returns_failed(
    kestra: KestraClient, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(
        url=f"{BASE}/api/v1/executions/{EXECUTION_ID}",
        status_code=404,
    )
    result = await kestra.get_status(EXECUTION_ID)
    assert result == "FAILED"


# ── cancel ────────────────────────────────────────────────────────────────────


async def test_cancel_calls_kill_endpoint(
    kestra: KestraClient, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(
        url=f"{BASE}/api/v1/executions/{EXECUTION_ID}/kill",
        status_code=204,
    )
    await kestra.cancel(EXECUTION_ID)  # should not raise


async def test_cancel_tolerates_404(
    kestra: KestraClient, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(
        url=f"{BASE}/api/v1/executions/{EXECUTION_ID}/kill",
        status_code=404,
    )
    await kestra.cancel(EXECUTION_ID)  # already gone — should not raise
