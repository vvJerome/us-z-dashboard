from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import ZeroBounceJob
from ..schemas.zerobounce import ZeroBounceJobResponse
from ..services import zerobounce_queue
from ..settings import get_settings
from ..utils.paths import assert_within

router = APIRouter(prefix="/zerobounce", tags=["zerobounce"])

VALID_EXTENSIONS = {".csv", ".jsonl", ".txt"}


def _get_data_dir() -> Path:
    return get_settings().data_dir


@router.post("", response_model=ZeroBounceJobResponse)
async def create_zerobounce_job(  # TODO: add auth
    file: UploadFile,
    email_col: str = "email",
    db: AsyncSession = Depends(get_db),
    data_dir: Path = Depends(_get_data_dir),
) -> ZeroBounceJobResponse:
    filename = file.filename or "upload.csv"
    if not any(filename.endswith(ext) for ext in VALID_EXTENSIONS):
        raise HTTPException(400, "File must be a .csv, .jsonl, or .txt")

    job_id = uuid.uuid4()
    input_dir = data_dir / "zerobounce" / str(job_id)
    input_path = input_dir / filename
    try:
        assert_within(input_path, data_dir)
    except ValueError:
        raise HTTPException(400, "Invalid filename") from None

    content = await file.read()
    if len(content) > 100 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 100 MB)")
    input_dir.mkdir(parents=True, exist_ok=True)
    input_path.write_bytes(content)

    job = ZeroBounceJob(
        id=job_id,
        status="QUEUED",
        input_filename=filename,
        filter_mode="all",
        email_col=email_col,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    await zerobounce_queue.try_promote(db, data_dir)

    return ZeroBounceJobResponse.model_validate(job)


@router.get("", response_model=list[ZeroBounceJobResponse])
async def list_zerobounce_jobs(  # TODO: add auth
    db: AsyncSession = Depends(get_db),
    data_dir: Path = Depends(_get_data_dir),
) -> list[ZeroBounceJobResponse]:
    await zerobounce_queue.try_promote(db, data_dir)
    result = await db.execute(
        select(ZeroBounceJob).order_by(ZeroBounceJob.created_at.desc()).limit(50)
    )
    return [ZeroBounceJobResponse.model_validate(j) for j in result.scalars()]


@router.get("/{job_id}", response_model=ZeroBounceJobResponse)
async def get_zerobounce_job(  # TODO: add auth
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    data_dir: Path = Depends(_get_data_dir),
) -> ZeroBounceJobResponse:
    await zerobounce_queue.try_promote(db, data_dir)
    result = await db.execute(select(ZeroBounceJob).where(ZeroBounceJob.id == job_id))
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(404, f"ZeroBounce job {job_id} not found")
    return ZeroBounceJobResponse.model_validate(job)


@router.get("/{job_id}/download")
async def download_zerobounce_result(  # TODO: add auth
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    data_dir: Path = Depends(_get_data_dir),
) -> FileResponse:
    result = await db.execute(select(ZeroBounceJob).where(ZeroBounceJob.id == job_id))
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(404, "Job not found")
    if job.status != "COMPLETED" or not job.output_file_key:
        raise HTTPException(409, "Result not ready yet")

    path = data_dir / job.output_file_key
    if not path.exists():
        raise HTTPException(404, "Output file not found")

    stem = Path(job.input_filename).stem
    return FileResponse(
        path=str(path),
        media_type="text/csv",
        filename=f"{stem}_zerobounce.csv",
    )
