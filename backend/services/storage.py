from __future__ import annotations

import uuid
from pathlib import Path


class StorageService:
    def __init__(self, data_dir: Path) -> None:
        self._data_dir = data_dir

    def input_path(self, job_id: uuid.UUID, filename: str) -> Path:
        return self._data_dir / "inputs" / str(job_id) / filename

    def output_path(self, job_id: uuid.UUID) -> Path:
        return self._data_dir / "outputs" / str(job_id) / "result.csv"

    def _log_path(self, job_id: uuid.UUID) -> Path:
        return self._data_dir / "logs" / str(job_id) / "run.log"

    def input_file_key(self, job_id: uuid.UUID, filename: str) -> str:
        """Relative key stored in DB and passed to the pipeline container."""
        return f"inputs/{job_id}/{filename}"

    def save_upload(self, job_id: uuid.UUID, filename: str, data: bytes) -> str:
        """Write uploaded bytes to the data volume. Returns the file key."""
        path = self.input_path(job_id, filename)
        path.parent.mkdir(parents=True, exist_ok=True)
        if ".." in str(path.relative_to(self._data_dir)):
            raise ValueError(f"Invalid path: {filename}")
        path.write_bytes(data)
        return self.input_file_key(job_id, filename)

    def read_log_tail(self, job_id: uuid.UUID, lines: int = 200) -> list[str]:
        """Return the last N lines of the job's run.log."""
        path = self._log_path(job_id)
        if not path.exists():
            return []
        text = path.read_text(encoding="utf-8", errors="replace")
        all_lines = text.splitlines()
        return all_lines[-lines:]

    def output_exists(self, job_id: uuid.UUID) -> bool:
        return self.output_path(job_id).exists()

