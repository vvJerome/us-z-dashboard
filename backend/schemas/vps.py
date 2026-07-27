from __future__ import annotations

import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

# Absolute path, safe charset only — this value is later interpolated into a
# remote shell command (backend/services/pipeline_ssh.py) as the sqlite3 file
# argument, so it must never contain shell metacharacters or ".." traversal.
_SAFE_DATA_DIR_RE = re.compile(r"^/[A-Za-z0-9_./-]*$")


class VpsCreate(BaseModel):
    name: str
    is_local: bool = False
    ssh_host: str | None = None
    ssh_user: str = "root"
    ssh_port: int = 22
    ssh_key_path: str | None = None
    data_dir: str = "/data"

    @field_validator("data_dir")
    @classmethod
    def _validate_data_dir(cls, v: str) -> str:
        if ".." in v or not _SAFE_DATA_DIR_RE.match(v):
            raise ValueError("data_dir must be a safe absolute path")
        return v


class VpsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    is_local: bool
    ssh_host: str | None
    ssh_user: str
    ssh_port: int
    data_dir: str
    is_active: bool
    created_at: datetime
