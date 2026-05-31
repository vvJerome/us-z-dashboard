from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from typing import Any

METRICS_TTL: float = 2.0

_cache: dict[str, dict[str, Any]] = {}
_locks: dict[str, asyncio.Lock] = {}


def _get_lock(job_id: str) -> asyncio.Lock:
    if job_id not in _locks:
        _locks[job_id] = asyncio.Lock()
    return _locks[job_id]


async def get_or_fetch(
    job_id: str,
    fetch_fn: Callable[[], Awaitable[dict[str, Any]]],
) -> dict[str, Any]:
    entry = _cache.get(job_id)
    if entry and time.monotonic() - entry["ts"] < METRICS_TTL:
        return entry["payload"]

    async with _get_lock(job_id):
        entry = _cache.get(job_id)
        if entry and time.monotonic() - entry["ts"] < METRICS_TTL:
            return entry["payload"]

        payload = await fetch_fn()
        _cache[job_id] = {"payload": payload, "ts": time.monotonic()}
        return payload


def invalidate(job_id: str) -> None:
    _cache.pop(job_id, None)
