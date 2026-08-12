from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Job, VpsInstance
from ..schemas.vps import VpsCreate, VpsResponse

router = APIRouter(tags=["vps"])


@router.get("", response_model=list[VpsResponse])
async def list_vps(db: AsyncSession = Depends(get_db)) -> list[VpsInstance]:
    # TODO: add auth
    result = await db.execute(
        select(VpsInstance)
        .where(VpsInstance.is_active == True)  # noqa: E712
        .order_by(VpsInstance.created_at)
    )
    return list(result.scalars().all())


@router.post("", response_model=VpsResponse, status_code=201)
async def create_vps(
    body: VpsCreate, db: AsyncSession = Depends(get_db)
) -> VpsInstance:
    # TODO: add auth
    vps = VpsInstance(
        id=uuid.uuid4(),
        name=body.name,
        is_local=body.is_local,
        ssh_host=body.ssh_host,
        ssh_user=body.ssh_user,
        ssh_port=body.ssh_port,
        ssh_key_path=body.ssh_key_path,
        data_dir=body.data_dir,
        repo_dir=body.repo_dir,
    )
    db.add(vps)
    await db.commit()
    await db.refresh(vps)
    return vps


@router.get("/{vps_id}", response_model=VpsResponse)
async def get_vps(vps_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> VpsInstance:
    # TODO: add auth
    return await _fetch_vps(db, vps_id)


@router.delete("/{vps_id}", status_code=204, response_model=None)
async def delete_vps(vps_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> None:
    # TODO: add auth
    await _fetch_vps(db, vps_id)
    active_jobs = await db.execute(
        select(Job).where(
            Job.vps_id == vps_id,
            Job.status.in_(["QUEUED", "RUNNING"]),
        )
    )
    if active_jobs.scalars().first():
        raise HTTPException(409, "VPS has active jobs; cancel them before removing")
    await db.execute(
        update(VpsInstance).where(VpsInstance.id == vps_id).values(is_active=False)
    )
    await db.commit()


async def _fetch_vps(db: AsyncSession, vps_id: uuid.UUID) -> VpsInstance:
    result = await db.execute(select(VpsInstance).where(VpsInstance.id == vps_id))
    vps = result.scalar_one_or_none()
    if vps is None:
        raise HTTPException(404, f"VPS {vps_id} not found")
    return vps
