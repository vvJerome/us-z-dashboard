from __future__ import annotations

import uuid

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
