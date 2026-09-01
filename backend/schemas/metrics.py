from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class MetricsResponse(BaseModel):
    run_id: str | None
    as_of: str
    build_ms: int
    states: dict[str, int]
    totals: dict[str, int]
    rate: dict[str, Any]
    throughput_60min: list[dict[str, Any]]
    backends: dict[str, Any]
    heartbeats: dict[str, Any]
    discovery: dict[str, Any]
    cost: dict[str, Any]
    cost_breakdown: dict[str, Any]
    run_history: list[dict[str, Any]]
    recent_validated: list[dict[str, Any]]
    top_recent_errors: list[dict[str, Any]]
    run_events: list[dict[str, Any]]
