from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Job
from ..schemas.jobs import (
    JobConfig,
    JobDownloadResponse,
    JobListResponse,
    JobLogsResponse,
    JobResponse,
)
from ..services.kestra import KestraClient
from ..services.storage import StorageService
from ..settings import get_settings

router = APIRouter(tags=["jobs"])

_MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100 MB
_ALLOWED_EXTENSIONS = {".jsonl", ".csv"}

# TODO: add auth — replace placeholder user_id with real current user
_PLACEHOLDER_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


def _get_kestra() -> KestraClient:
    s = get_settings()
    return KestraClient(s.kestra_base_url, s.kestra_webhook_key)


def _get_storage() -> StorageService:
    return StorageService(get_settings().data_dir)


@router.post("", response_model=JobResponse, status_code=201)
async def create_job(
    file: UploadFile,
    enable_proxy: bool = False,
    skip_duplicates: bool = True,
    db: AsyncSession = Depends(get_db),
    kestra: KestraClient = Depends(_get_kestra),
    storage: StorageService = Depends(_get_storage),
) -> Job:
    # TODO: add auth
    _validate_upload(file)

    data = await file.read()
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File exceeds 100 MB limit")

    job_id = uuid.uuid4()
    config = JobConfig(enable_proxy=enable_proxy, skip_duplicates=skip_duplicates)

    file_key = storage.save_upload(job_id, file.filename or "input.jsonl", data)

    job = Job(
        id=job_id,
        user_id=_PLACEHOLDER_USER_ID,
        status="QUEUED",
        input_filename=file.filename or "input.jsonl",
        input_file_key=file_key,
        config={
            "enable_proxy": config.enable_proxy,
            "skip_duplicates": config.skip_duplicates,
        },
    )
    db.add(job)
    await db.flush()

    try:
        execution_id = await kestra.trigger(job_id, file_key, config)
        job.kestra_execution_id = execution_id
    except Exception as exc:
        job.status = "FAILED"
        job.error_message = f"Failed to trigger Kestra: {exc}"

    await db.commit()
    await db.refresh(job)
    return job  # type: ignore[return-value]


@router.get("", response_model=JobListResponse)
async def list_jobs(db: AsyncSession = Depends(get_db)) -> JobListResponse:
    # TODO: add auth — filter by current user
    result = await db.execute(select(Job).order_by(Job.created_at.desc()))
    jobs = result.scalars().all()
    return JobListResponse(jobs=list(jobs), total=len(jobs))  # type: ignore[arg-type]


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    kestra: KestraClient = Depends(_get_kestra),
) -> Job:
    # TODO: add auth
    job = await _fetch_job(db, job_id)
    await _sync_status(db, job, kestra)
    return job  # type: ignore[return-value]


@router.get("/{job_id}/logs", response_model=JobLogsResponse)
async def get_logs(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    storage: StorageService = Depends(_get_storage),
) -> JobLogsResponse:
    # TODO: add auth
    await _fetch_job(db, job_id)
    lines = storage.read_log_tail(job_id)
    return JobLogsResponse(lines=lines)


@router.get("/{job_id}/download", response_model=JobDownloadResponse)
async def get_download_url(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    storage: StorageService = Depends(_get_storage),
) -> JobDownloadResponse:
    # TODO: add auth
    job = await _fetch_job(db, job_id)
    if job.status != "COMPLETED":
        raise HTTPException(409, "Job is not yet completed")
    if not storage.output_exists(job_id):
        raise HTTPException(404, "Output file not found")
    return JobDownloadResponse(url=f"/api/jobs/{job_id}/file")


@router.get("/{job_id}/file")
async def download_file(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    storage: StorageService = Depends(_get_storage),
) -> FileResponse:
    # TODO: add auth
    job = await _fetch_job(db, job_id)
    if job.status != "COMPLETED":
        raise HTTPException(409, "Job is not yet completed")
    path = storage.output_path(job_id)
    if not path.exists():
        raise HTTPException(404, "Output file not found")
    return FileResponse(path, filename=f"result_{job_id}.csv", media_type="text/csv")


@router.delete("/{job_id}", status_code=204, response_model=None)
async def cancel_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    kestra: KestraClient = Depends(_get_kestra),
) -> None:
    # TODO: add auth
    job = await _fetch_job(db, job_id)
    if job.status not in ("QUEUED", "RUNNING"):
        raise HTTPException(409, f"Cannot cancel a job with status {job.status}")
    if job.kestra_execution_id:
        await kestra.cancel(job.kestra_execution_id)
    await db.execute(
        update(Job)
        .where(Job.id == job_id)
        .values(status="CANCELLED", finished_at=datetime.now(timezone.utc))
    )
    await db.commit()


# ── Helpers ──────────────────────────────────────────────────────────────────


def _validate_upload(file: UploadFile) -> None:
    if not file.filename:
        raise HTTPException(400, "Filename is required")
    ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            400, f"File type not allowed. Accepted: {', '.join(_ALLOWED_EXTENSIONS)}"
        )


async def _fetch_job(db: AsyncSession, job_id: uuid.UUID) -> Job:
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(404, f"Job {job_id} not found")
    return job


async def _sync_status(db: AsyncSession, job: Job, kestra: KestraClient) -> None:
    """Pull current state from Kestra and update the DB if it changed."""
    if (
        job.status in ("COMPLETED", "FAILED", "CANCELLED")
        or not job.kestra_execution_id
    ):
        return
    try:
        new_status = await kestra.get_status(job.kestra_execution_id)
    except Exception as exc:
        # Non-fatal — Kestra may be temporarily unreachable; job status stays stale.
        import logging

        logging.getLogger(__name__).warning(
            "Kestra status fetch failed for %s: %s", job.id, exc
        )
        return

    if new_status == job.status:
        return

    now = datetime.now(timezone.utc)
    values: dict = {"status": new_status}
    if new_status == "RUNNING" and job.started_at is None:
        values["started_at"] = now
    if new_status in ("COMPLETED", "FAILED", "CANCELLED"):
        values["finished_at"] = now
    if new_status == "COMPLETED" and job.output_file_key is None:
        values["output_file_key"] = f"outputs/{job.id}/result.csv"

    await db.execute(update(Job).where(Job.id == job.id).values(**values))
    await db.commit()
    await db.refresh(job)
