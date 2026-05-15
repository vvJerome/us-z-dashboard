from __future__ import annotations

import uuid
from pathlib import Path

import pytest

from backend.services.storage import StorageService


@pytest.fixture
def storage(tmp_path: Path) -> StorageService:
    return StorageService(tmp_path)


@pytest.fixture
def job_id() -> uuid.UUID:
    return uuid.UUID("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")


# ── save_upload ───────────────────────────────────────────────────────────────


def test_save_upload_creates_file(storage: StorageService, job_id: uuid.UUID) -> None:
    content = b'{"unique_id":"1","business_name":"Test"}\n'
    key = storage.save_upload(job_id, "input.jsonl", content)

    path = storage.input_path(job_id, "input.jsonl")
    assert path.exists()
    assert path.read_bytes() == content
    assert key == f"inputs/{job_id}/input.jsonl"


def test_save_upload_creates_parent_dirs(
    storage: StorageService, job_id: uuid.UUID
) -> None:
    storage.save_upload(job_id, "input.csv", b"col1,col2\n")
    assert storage.input_path(job_id, "input.csv").parent.is_dir()


def test_save_upload_rejects_path_traversal(
    storage: StorageService, job_id: uuid.UUID
) -> None:
    with pytest.raises(ValueError):
        storage.save_upload(job_id, "../evil.jsonl", b"bad")


# ── read_log_tail ─────────────────────────────────────────────────────────────


def test_read_log_tail_returns_empty_when_no_file(
    storage: StorageService, job_id: uuid.UUID
) -> None:
    assert storage.read_log_tail(job_id) == []


def test_read_log_tail_returns_all_lines_when_fewer_than_limit(
    storage: StorageService, job_id: uuid.UUID, tmp_path: Path
) -> None:
    log = tmp_path / "logs" / str(job_id) / "run.log"
    log.parent.mkdir(parents=True, exist_ok=True)
    log.write_text("line A\nline B\nline C\n")

    result = storage.read_log_tail(job_id)
    assert result == ["line A", "line B", "line C"]


def test_read_log_tail_trims_to_limit(
    storage: StorageService, job_id: uuid.UUID, tmp_path: Path
) -> None:
    log = tmp_path / "logs" / str(job_id) / "run.log"
    log.parent.mkdir(parents=True, exist_ok=True)
    all_lines = [f"line {i}" for i in range(300)]
    log.write_text("\n".join(all_lines))

    result = storage.read_log_tail(job_id, lines=50)
    assert len(result) == 50
    assert result[0] == "line 250"
    assert result[-1] == "line 299"


# ── output_exists ─────────────────────────────────────────────────────────────


def test_output_exists_false_when_missing(
    storage: StorageService, job_id: uuid.UUID
) -> None:
    assert storage.output_exists(job_id) is False


def test_output_exists_true_after_write(
    storage: StorageService, job_id: uuid.UUID, tmp_path: Path
) -> None:
    out = tmp_path / "outputs" / str(job_id) / "result.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("email,domain\nfoo@bar.com,bar.com\n")

    assert storage.output_exists(job_id) is True


# ── file_key helpers ──────────────────────────────────────────────────────────


def test_input_file_key_format(storage: StorageService, job_id: uuid.UUID) -> None:
    key = storage.input_file_key(job_id, "input.jsonl")
    assert key == f"inputs/{job_id}/input.jsonl"
    assert ".." not in key
