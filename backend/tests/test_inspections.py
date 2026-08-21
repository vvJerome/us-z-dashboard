from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import SavedInspection, VpsInstance

_UNSAFE_PATHS = [
    '/data"; rm -rf / #',
    "/data/../../etc",
    "relative/not/absolute",
    "/data$(whoami)",
    "/data`id`",
]


async def test_create_inspection_happy_path(
    client: AsyncClient, db: AsyncSession
) -> None:
    vps = VpsInstance(id=uuid.uuid4(), name="manual-vps", is_local=True)
    db.add(vps)
    await db.commit()

    resp = await client.post(
        "/inspections",
        json={
            "name": "Wisconsin run",
            "vps_id": str(vps.id),
            "db_path": "/home/devonly/pipeline_runs/wi/output/wi_full/pipeline.db",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Wisconsin run"
    assert body["vps_id"] == str(vps.id)


async def test_create_inspection_unknown_vps(client: AsyncClient) -> None:
    resp = await client.post(
        "/inspections",
        json={
            "name": "orphan",
            "vps_id": str(uuid.uuid4()),
            "db_path": "/home/devonly/pipeline.db",
        },
    )
    assert resp.status_code == 404


@pytest.mark.parametrize("db_path", _UNSAFE_PATHS)
async def test_create_inspection_rejects_unsafe_path(
    client: AsyncClient, db: AsyncSession, db_path: str
) -> None:
    vps = VpsInstance(id=uuid.uuid4(), name="manual-vps-2", is_local=True)
    db.add(vps)
    await db.commit()

    resp = await client.post(
        "/inspections",
        json={"name": "evil", "vps_id": str(vps.id), "db_path": db_path},
    )
    assert resp.status_code == 422


async def test_list_inspections(client: AsyncClient, db: AsyncSession) -> None:
    vps = VpsInstance(id=uuid.uuid4(), name="manual-vps-3", is_local=True)
    db.add(vps)
    await db.commit()
    db.add(
        SavedInspection(
            id=uuid.uuid4(),
            name="saved-one",
            vps_id=vps.id,
            db_path="/home/devonly/pipeline.db",
        )
    )
    await db.commit()

    resp = await client.get("/inspections")
    assert resp.status_code == 200
    names = {i["name"] for i in resp.json()}
    assert "saved-one" in names


async def test_get_inspection_not_found(client: AsyncClient) -> None:
    resp = await client.get(f"/inspections/{uuid.uuid4()}")
    assert resp.status_code == 404


async def test_get_inspection_returns_saved_record(
    client: AsyncClient, db: AsyncSession
) -> None:
    vps = VpsInstance(id=uuid.uuid4(), name="manual-vps-4", is_local=True)
    db.add(vps)
    await db.commit()
    inspection = SavedInspection(
        id=uuid.uuid4(),
        name="lookup-me",
        vps_id=vps.id,
        db_path="/home/devonly/pipeline.db",
    )
    db.add(inspection)
    await db.commit()

    resp = await client.get(f"/inspections/{inspection.id}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "lookup-me"


async def test_delete_inspection(client: AsyncClient, db: AsyncSession) -> None:
    vps = VpsInstance(id=uuid.uuid4(), name="manual-vps-5", is_local=True)
    db.add(vps)
    await db.commit()
    inspection = SavedInspection(
        id=uuid.uuid4(),
        name="to-delete",
        vps_id=vps.id,
        db_path="/home/devonly/pipeline.db",
    )
    db.add(inspection)
    await db.commit()

    resp = await client.delete(f"/inspections/{inspection.id}")
    assert resp.status_code == 204

    resp = await client.get(f"/inspections/{inspection.id}")
    assert resp.status_code == 404
