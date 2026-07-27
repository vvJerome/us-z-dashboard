from __future__ import annotations

from pathlib import Path


def assert_within(path: Path, base: Path) -> None:
    """Reject a path that escapes base via a `..` segment (directory traversal)."""
    if ".." in str(path.relative_to(base)):
        raise ValueError(f"Invalid path: {path}")
