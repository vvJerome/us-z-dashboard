from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import Job, VpsInstance

from .conftest import PLACEHOLDER_USER_ID


def _make_metrics_payload() -> dict:
    return {
        "run_id": "run_wi_full",
        "as_of": "2026-08-19T00:00:00",
        "build_ms": 5,
        "states": {"VALIDATED": 1},
        "totals": {"all": 1, "terminal": 1, "pending": 0},
        "rate": {"last_15min": 0, "per_hour": 0, "eta_hours": None, "complete": True},
        "throughput_60min": [],
        "backends": {
            "smtp": {"error_pct": 0, "total": 0},
        },
        "heartbeats": {"producer": None, "dispatcher": None},
        "discovery": {
            "first_party": 0,
            "third_party": 0,
            "failed": 0,
            "total_input": 0,
            "hit_rate_pct": 0,
        },
        "cost": {"spent_usd": 0, "ceiling_usd": None, "pct": None},
        "cost_breakdown": {"services": []},
        "run_history": [],
        "recent_validated": [],
        "top_recent_errors": [],
        "run_events": [],
    }


async def _make_job(db: AsyncSession, vps_id: uuid.UUID | None, **overrides) -> Job:
    fields = {
        "id": uuid.uuid4(),
        "user_id": PLACEHOLDER_USER_ID,
        "vps_id": vps_id,
        "status": "RUNNING",
        "input_filename": "in.jsonl",
        "input_file_key": f"inputs/{uuid.uuid4()}/in.jsonl",
        "config": {},
        **overrides,
    }
    job = Job(**fields)
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


async def test_get_metrics_job_not_found(client: AsyncClient) -> None:
    resp = await client.get(f"/jobs/{uuid.uuid4()}/metrics")
    assert resp.status_code == 404


async def test_get_metrics_rejects_queued_job(
    client: AsyncClient, db: AsyncSession
) -> None:
    job = await _make_job(db, vps_id=None, status="QUEUED")
    resp = await client.get(f"/jobs/{job.id}/metrics")
    assert resp.status_code == 409


async def test_get_metrics_no_vps_for_job(
    client: AsyncClient, db: AsyncSession
) -> None:
    job = await _make_job(db, vps_id=None, status="RUNNING")
    resp = await client.get(f"/jobs/{job.id}/metrics")
    assert resp.status_code == 404
    assert "VPS not found" in resp.json()["detail"]


async def test_get_metrics_happy_path(client: AsyncClient, db: AsyncSession) -> None:
    vps = VpsInstance(id=uuid.uuid4(), name="worker-metrics", is_local=True)
    db.add(vps)
    await db.commit()
    job = await _make_job(db, vps_id=vps.id, status="RUNNING")

    with patch(
        "backend.routers.metrics.pipeline_ssh.fetch_metrics",
        new=AsyncMock(return_value=_make_metrics_payload()),
    ):
        resp = await client.get(f"/jobs/{job.id}/metrics")

    assert resp.status_code == 200
    assert resp.json()["run_id"] == "run_wi_full"


async def test_get_metrics_completed_job_allowed(
    client: AsyncClient, db: AsyncSession
) -> None:
    vps = VpsInstance(id=uuid.uuid4(), name="worker-metrics-2", is_local=True)
    db.add(vps)
    await db.commit()
    job = await _make_job(db, vps_id=vps.id, status="COMPLETED")

    with patch(
        "backend.routers.metrics.pipeline_ssh.fetch_metrics",
        new=AsyncMock(return_value=_make_metrics_payload()),
    ):
        resp = await client.get(f"/jobs/{job.id}/metrics")

    assert resp.status_code == 200


async def test_get_metrics_maps_runtime_error_to_502(
    client: AsyncClient, db: AsyncSession
) -> None:
    vps = VpsInstance(id=uuid.uuid4(), name="worker-metrics-3", is_local=True)
    db.add(vps)
    await db.commit()
    job = await _make_job(db, vps_id=vps.id, status="RUNNING")

    with patch(
        "backend.routers.metrics.pipeline_ssh.fetch_metrics",
        new=AsyncMock(side_effect=RuntimeError("sqlite3 CLI not found")),
    ):
        resp = await client.get(f"/jobs/{job.id}/metrics")

    assert resp.status_code == 502
