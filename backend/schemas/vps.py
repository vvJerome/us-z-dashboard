from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

from ..utils.paths import validate_safe_absolute_path


class VpsCreate(BaseModel):
    name: str
    is_local: bool = False
    ssh_host: str | None = None
    ssh_user: str = "root"
    ssh_port: int = 22
    ssh_key_path: str | None = None
    data_dir: str = "/data"
    repo_dir: str

    @field_validator("data_dir", "repo_dir")
    @classmethod
    def _validate_safe_path(cls, v: str) -> str:
        return validate_safe_absolute_path(v)


class VpsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    is_local: bool
    ssh_host: str | None
    ssh_user: str
    ssh_port: int
    data_dir: str
    repo_dir: str
    is_active: bool
    created_at: datetime
