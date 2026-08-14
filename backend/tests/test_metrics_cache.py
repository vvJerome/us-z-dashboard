from __future__ import annotations

from unittest.mock import AsyncMock

from backend.services import metrics_cache


async def test_get_or_fetch_calls_fetch_fn_on_first_call() -> None:
    metrics_cache.invalidate("job-cache-1")
    fetch = AsyncMock(return_value={"run_id": "r1"})
    result = await metrics_cache.get_or_fetch("job-cache-1", fetch)
    assert result == {"run_id": "r1"}
    fetch.assert_awaited_once()


async def test_get_or_fetch_returns_cached_value_within_ttl() -> None:
    metrics_cache.invalidate("job-cache-2")
    fetch = AsyncMock(return_value={"run_id": "r1"})
    await metrics_cache.get_or_fetch("job-cache-2", fetch)
    result = await metrics_cache.get_or_fetch("job-cache-2", fetch)
    assert result == {"run_id": "r1"}
    fetch.assert_awaited_once()


async def test_invalidate_forces_refetch() -> None:
    metrics_cache.invalidate("job-cache-3")
    fetch = AsyncMock(side_effect=[{"run_id": "r1"}, {"run_id": "r2"}])
    await metrics_cache.get_or_fetch("job-cache-3", fetch)
    metrics_cache.invalidate("job-cache-3")
    result = await metrics_cache.get_or_fetch("job-cache-3", fetch)
    assert result == {"run_id": "r2"}
    assert fetch.await_count == 2


async def test_invalidate_unknown_job_id_is_a_noop() -> None:
    metrics_cache.invalidate("never-cached")
