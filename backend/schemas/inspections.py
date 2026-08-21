from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

from ..utils.paths import validate_safe_absolute_path


class SavedInspectionCreate(BaseModel):
    name: str
    vps_id: uuid.UUID
    db_path: str

    @field_validator("db_path")
    @classmethod
    def _validate_safe_path(cls, v: str) -> str:
        return validate_safe_absolute_path(v)


class SavedInspectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    vps_id: uuid.UUID
    db_path: str
    created_at: datetime
