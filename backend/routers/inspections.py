from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import SavedInspection, VpsInstance
from ..schemas.inspections import SavedInspectionCreate, SavedInspectionResponse

router = APIRouter(tags=["inspections"])


@router.get("", response_model=list[SavedInspectionResponse])
async def list_inspections(
    db: AsyncSession = Depends(get_db),
) -> list[SavedInspection]:
    # TODO: add auth
    result = await db.execute(
        select(SavedInspection).order_by(SavedInspection.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("", response_model=SavedInspectionResponse, status_code=201)
async def create_inspection(
    body: SavedInspectionCreate, db: AsyncSession = Depends(get_db)
) -> SavedInspection:
    # TODO: add auth
    vps = await db.get(VpsInstance, body.vps_id)
    if vps is None or not vps.is_active:
        raise HTTPException(404, f"VPS {body.vps_id} not found")

    inspection = SavedInspection(
        id=uuid.uuid4(),
        name=body.name,
        vps_id=body.vps_id,
        db_path=body.db_path,
    )
    db.add(inspection)
    await db.commit()
    await db.refresh(inspection)
    return inspection


@router.get("/{inspection_id}", response_model=SavedInspectionResponse)
async def get_inspection(
    inspection_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> SavedInspection:
    # TODO: add auth
    inspection = await db.get(SavedInspection, inspection_id)
    if inspection is None:
        raise HTTPException(404, f"Saved inspection {inspection_id} not found")
    return inspection


@router.delete("/{inspection_id}", status_code=204, response_model=None)
async def delete_inspection(
    inspection_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> None:
    # TODO: add auth
    inspection = await db.get(SavedInspection, inspection_id)
    if inspection is None:
        raise HTTPException(404, f"Saved inspection {inspection_id} not found")
    await db.delete(inspection)
    await db.commit()
