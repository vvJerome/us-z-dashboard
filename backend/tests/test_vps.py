from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import Job, VpsInstance


_UNSAFE_PATHS = [
    '/data"; rm -rf / #',
    "/data/../../etc",
    "relative/not/absolute",
    "/data$(whoami)",
    "/data`id`",
]


@pytest.mark.parametrize("data_dir", _UNSAFE_PATHS)
async def test_create_vps_rejects_unsafe_data_dir(
    client: AsyncClient, data_dir: str
) -> None:
    resp = await client.post(
        "/vps",
        json={
            "name": "evil",
            "is_local": True,
            "data_dir": data_dir,
            "repo_dir": "/home/devonly/projects/universal-scraper-v3",
        },
    )
    assert resp.status_code == 422


@pytest.mark.parametrize("repo_dir", _UNSAFE_PATHS)
async def test_create_vps_rejects_unsafe_repo_dir(
    client: AsyncClient, repo_dir: str
) -> None:
    resp = await client.post(
        "/vps",
        json={"name": "evil", "is_local": True, "repo_dir": repo_dir},
    )
    assert resp.status_code == 422


async def test_create_vps_requires_repo_dir(client: AsyncClient) -> None:
    resp = await client.post(
        "/vps",
        json={"name": "worker-2", "is_local": True, "data_dir": "/data/worker2"},
    )
    assert resp.status_code == 422


async def test_create_vps_accepts_safe_data_dir(client: AsyncClient) -> None:
    resp = await client.post(
        "/vps",
        json={
            "name": "worker-2",
            "is_local": True,
            "data_dir": "/data/worker2",
            "repo_dir": "/home/devonly/projects/universal-scraper-v3-2",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["data_dir"] == "/data/worker2"
    assert resp.json()["repo_dir"] == "/home/devonly/projects/universal-scraper-v3-2"


async def test_list_vps_returns_only_active(
    client: AsyncClient, db: AsyncSession
) -> None:
    active = VpsInstance(id=uuid.uuid4(), name="active-vps", is_local=True)
    inactive = VpsInstance(
        id=uuid.uuid4(), name="inactive-vps", is_local=True, is_active=False
    )
    db.add_all([active, inactive])
    await db.commit()

    resp = await client.get("/vps")
    assert resp.status_code == 200
    names = {v["name"] for v in resp.json()}
    assert "active-vps" in names
    assert "inactive-vps" not in names


async def test_get_vps_not_found(client: AsyncClient) -> None:
    resp = await client.get(f"/vps/{uuid.uuid4()}")
    assert resp.status_code == 404


async def test_delete_vps_marks_inactive(client: AsyncClient, db: AsyncSession) -> None:
    vps = VpsInstance(id=uuid.uuid4(), name="to-delete", is_local=True)
    db.add(vps)
    await db.commit()

    resp = await client.delete(f"/vps/{vps.id}")
    assert resp.status_code == 204

    resp = await client.get("/vps")
    assert vps.id not in {uuid.UUID(v["id"]) for v in resp.json()}


async def test_delete_vps_rejects_when_jobs_active(
    client: AsyncClient, db: AsyncSession
) -> None:
    from backend.tests.conftest import PLACEHOLDER_USER_ID

    vps = VpsInstance(id=uuid.uuid4(), name="busy-vps", is_local=True)
    db.add(vps)
    await db.commit()
    db.add(
        Job(
            id=uuid.uuid4(),
            user_id=PLACEHOLDER_USER_ID,
            vps_id=vps.id,
            status="RUNNING",
            input_filename="in.jsonl",
            input_file_key="inputs/x/in.jsonl",
            config={},
        )
    )
    await db.commit()

    resp = await client.delete(f"/vps/{vps.id}")
    assert resp.status_code == 409


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
            "racknerd": {"error_pct": 0, "total": 0},
            "zuhal": {"error_pct": 0, "total": 0},
        },
        "discovery": {
            "dns": 0,
            "serper": 0,
            "failed": 0,
            "total_input": 0,
            "hit_rate_pct": 0,
        },
        "cost": {"spent_usd": 0, "ceiling_usd": None, "pct": None},
        "cost_breakdown": {"services": []},
        "run_history": [],
        "recent_validated": [],
        "top_recent_errors": [],
    }


async def test_get_vps_db_metrics_happy_path(
    client: AsyncClient, db: AsyncSession
) -> None:
    vps = VpsInstance(id=uuid.uuid4(), name="manual-vps", is_local=True)
    db.add(vps)
    await db.commit()

    with patch(
        "backend.routers.vps.pipeline_ssh.fetch_metrics",
        new=AsyncMock(return_value=_make_metrics_payload()),
    ):
        resp = await client.get(
            f"/vps/{vps.id}/db-metrics",
            params={
                "db_path": "/home/devonly/pipeline_runs/wi/output/wi_full/pipeline.db"
            },
        )
    assert resp.status_code == 200
    assert resp.json()["run_id"] == "run_wi_full"


async def test_get_vps_db_metrics_unknown_vps(client: AsyncClient) -> None:
    resp = await client.get(
        f"/vps/{uuid.uuid4()}/db-metrics",
        params={"db_path": "/home/devonly/pipeline.db"},
    )
    assert resp.status_code == 404


@pytest.mark.parametrize("db_path", _UNSAFE_PATHS)
async def test_get_vps_db_metrics_rejects_unsafe_path(
    client: AsyncClient, db: AsyncSession, db_path: str
) -> None:
    vps = VpsInstance(id=uuid.uuid4(), name="manual-vps-2", is_local=True)
    db.add(vps)
    await db.commit()

    resp = await client.get(f"/vps/{vps.id}/db-metrics", params={"db_path": db_path})
    assert resp.status_code == 422


async def test_get_vps_db_metrics_maps_runtime_error_to_502(
    client: AsyncClient, db: AsyncSession
) -> None:
    vps = VpsInstance(id=uuid.uuid4(), name="manual-vps-3", is_local=True)
    db.add(vps)
    await db.commit()

    with patch(
        "backend.routers.vps.pipeline_ssh.fetch_metrics",
        new=AsyncMock(side_effect=RuntimeError("sqlite3 CLI not found")),
    ):
        resp = await client.get(
            f"/vps/{vps.id}/db-metrics",
            params={"db_path": "/home/devonly/pipeline.db"},
        )
    assert resp.status_code == 502
