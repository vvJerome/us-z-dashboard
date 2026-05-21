from __future__ import annotations

import json
import uuid
from typing import TYPE_CHECKING

import httpx

if TYPE_CHECKING:
    from ..schemas.jobs import JobConfig

# Maps Kestra execution states to our job status enum
_KESTRA_STATE_MAP: dict[str, str] = {
    "CREATED": "QUEUED",
    "RESTARTED": "QUEUED",
    "RUNNING": "RUNNING",
    "PAUSED": "RUNNING",
    "SUCCESS": "COMPLETED",
    "FAILED": "FAILED",
    "KILLING": "RUNNING",
    "KILLED": "CANCELLED",
    "WARNING": "COMPLETED",
}


class KestraClient:
    def __init__(self, base_url: str, webhook_key: str) -> None:
        self._base_url = base_url.rstrip("/")
        self._webhook_key = webhook_key

    async def trigger(
        self, job_id: uuid.UUID, input_file_key: str, config: "JobConfig"
    ) -> str:
        """Trigger the run-scraper flow via executions API. Returns Kestra execution ID."""
        url = f"{self._base_url}/api/v1/executions/prod/run-scraper"
        files = {
            "job_id": (None, str(job_id)),
            "input_file_key": (None, input_file_key),
            "config": (None, json.dumps({"enable_proxy": config.enable_proxy, "skip_duplicates": config.skip_duplicates})),
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, files=files)
            response.raise_for_status()
            return response.json()["id"]

    async def get_status(self, execution_id: str) -> str:
        """Fetch current execution state and map to our status enum."""
        url = f"{self._base_url}/api/v1/executions/{execution_id}"
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url)
            if response.status_code == 404:
                return "FAILED"
            response.raise_for_status()
            state = response.json().get("state", {}).get("current", "")
            return _KESTRA_STATE_MAP.get(state, "RUNNING")

    async def cancel(self, execution_id: str) -> None:
        """Send kill signal to a running Kestra execution."""
        url = f"{self._base_url}/api/v1/executions/{execution_id}/kill"
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.delete(url)
            if response.status_code not in (200, 204, 404):
                response.raise_for_status()
