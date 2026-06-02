from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class ZeroBounceJobResponse(BaseModel):
    id: uuid.UUID
    status: str
    input_filename: str
    filter_mode: str
    email_col: str
    email_count: int | None
    processed_count: int | None
    output_file_key: str | None
    error_message: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None

    model_config = {"from_attributes": True}
