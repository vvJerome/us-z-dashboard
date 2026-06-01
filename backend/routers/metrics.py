from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Job, VpsInstance
from ..schemas.metrics import MetricsResponse
from ..services import metrics_cache, pipeline_ssh

router = APIRouter(tags=["metrics"])


async def _load_vps(db: AsyncSession, job: Job) -> VpsInstance | None:
    if job.vps_id is None:
        return None
    result = await db.execute(select(VpsInstance).where(VpsInstance.id == job.vps_id))
    return result.scalar_one_or_none()


@router.get("/{job_id}/metrics", response_model=MetricsResponse)
async def get_metrics(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> MetricsResponse:  # TODO: add auth
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    if job.status not in ("RUNNING", "COMPLETED"):
        raise HTTPException(status_code=409, detail="Job is not RUNNING")

    vps = await _load_vps(db, job)
    if vps is None:
        raise HTTPException(status_code=404, detail="VPS not found for this job")

    data_dir = vps.data_dir or "/data"
    db_path = f"{data_dir}/jobs/{job_id}/v2/pipeline.db"

    try:
        payload = await metrics_cache.get_or_fetch(
            str(job_id),
            lambda: pipeline_ssh.fetch_metrics(vps, db_path),
        )
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=f"Pipeline DB unavailable: {e}") from e

    return MetricsResponse(**payload)
