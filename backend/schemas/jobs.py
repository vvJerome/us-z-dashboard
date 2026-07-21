from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


JobStatus = Literal["QUEUED", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"]


class JobConfig(BaseModel):
    enable_proxy: bool = False
    skip_duplicates: bool = True
    serper_api_key: str | None = None
    zuhal_api_key: str | None = None


class JobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: JobStatus
    input_filename: str
    config: dict
    worker_session: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    error_message: str | None
    output_file_key: str | None
    vps_id: uuid.UUID | None


class JobListResponse(BaseModel):
    jobs: list[JobResponse]
    total: int


class JobLogsResponse(BaseModel):
    lines: list[str]


class JobDownloadResponse(BaseModel):
    url: str
