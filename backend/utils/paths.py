from __future__ import annotations

import re
from pathlib import Path

# Absolute path, safe charset only — used for VpsInstance.data_dir/repo_dir,
# both of which are later interpolated into remote shell commands (worker.py,
# pipeline_ssh.py), so neither may contain shell metacharacters or ".." traversal.
_SAFE_ABS_PATH_RE = re.compile(r"^/[A-Za-z0-9_./-]*$")


def assert_within(path: Path, base: Path) -> None:
    """Reject a path that escapes base via a `..` segment (directory traversal)."""
    if ".." in str(path.relative_to(base)):
        raise ValueError(f"Invalid path: {path}")


def validate_safe_absolute_path(v: str) -> str:
    """Reject anything but a plain absolute path — no traversal, no shell metacharacters."""
    if ".." in v or not _SAFE_ABS_PATH_RE.match(v):
        raise ValueError("must be a safe absolute path")
    return v
