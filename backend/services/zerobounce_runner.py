from __future__ import annotations

import asyncio
import csv
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aiohttp
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..models import ZeroBounceJob

logger = logging.getLogger("zerobounce")

ZB_VALIDATE_URL = "https://api.zerobounce.net/v2/validate"
ZB_CREDITS_URL = "https://api.zerobounce.net/v2/getcredits"
CONCURRENCY = 10

ZB_OUTPUT_COLS = [
    "zb_status",
    "zb_sub_status",
    "zb_free_email",
    "zb_did_you_mean",
    "zb_smtp_provider",
    "zb_mx_found",
    "zb_mx_record",
]


async def _get_credits(session: aiohttp.ClientSession, api_key: str) -> int:
    async with session.get(ZB_CREDITS_URL, params={"api_key": api_key}) as r:
        data = await r.json()
        return int(data.get("Credits", 0))


async def _validate_one(
    session: aiohttp.ClientSession,
    sem: asyncio.Semaphore,
    api_key: str,
    email: str,
) -> dict[str, str]:
    async with sem:
        try:
            params = {"api_key": api_key, "email": email, "ip_address": ""}
            async with session.get(
                ZB_VALIDATE_URL,
                params=params,
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                resp.raise_for_status()
                data = await resp.json()
        except Exception as exc:
            # Log the exception type only — aiohttp.ClientResponseError's message
            # embeds the full request URL (including api_key) via request_info.
            logger.warning("ZeroBounce error for %s: %s", email, type(exc).__name__)
            return {col: "error" for col in ZB_OUTPUT_COLS}

    return {
        "zb_status": data.get("status", ""),
        "zb_sub_status": data.get("sub_status", ""),
        "zb_free_email": str(data.get("free_email", "")).lower(),
        "zb_did_you_mean": data.get("did_you_mean") or "",
        "zb_smtp_provider": data.get("smtp_provider") or "",
        "zb_mx_found": str(data.get("mx_found", "")).lower(),
        "zb_mx_record": data.get("mx_record") or "",
    }


async def run_zerobounce(
    job_id: uuid.UUID,
    input_path: Path,
    output_path: Path,
    email_col: str,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    api_key = os.environ.get("ZEROBOUNCE_API_KEY", "")

    async def _update(status: str, **kwargs: Any) -> None:
        async with session_factory() as db:
            from sqlalchemy import select

            result = await db.execute(
                select(ZeroBounceJob).where(ZeroBounceJob.id == job_id)
            )
            job = result.scalar_one()
            job.status = status
            for k, v in kwargs.items():
                setattr(job, k, v)
            await db.commit()

    try:
        await _update("RUNNING", started_at=datetime.now(timezone.utc))

        if not api_key:
            raise RuntimeError("ZEROBOUNCE_API_KEY is not set")

        with open(input_path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            fieldnames = list(reader.fieldnames or [])
            if email_col not in fieldnames:
                raise RuntimeError(
                    f"Column '{email_col}' not found. Available: {fieldnames}"
                )
            rows = [r for r in reader if r.get(email_col, "").strip()]

        if not rows:
            raise RuntimeError("No rows with a valid email address found in file.")

        await _update("RUNNING", email_count=len(rows))

        async with aiohttp.ClientSession() as http:
            credits = await _get_credits(http, api_key)
            if credits < len(rows):
                raise RuntimeError(
                    f"Not enough ZeroBounce credits ({credits:,} available, "
                    f"{len(rows):,} needed)"
                )

            sem = asyncio.Semaphore(CONCURRENCY)
            out_fieldnames = fieldnames + [
                c for c in ZB_OUTPUT_COLS if c not in fieldnames
            ]
            processed = 0

            async def _do(row: dict[str, Any], writer: csv.DictWriter, f: Any) -> None:
                nonlocal processed
                email = row[email_col].strip()
                zb = await _validate_one(http, sem, api_key, email)
                writer.writerow({**row, **zb})
                f.flush()
                processed += 1
                if processed % 100 == 0 or processed == len(rows):
                    await _update("RUNNING", processed_count=processed)

            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(
                    f, fieldnames=out_fieldnames, extrasaction="ignore"
                )
                writer.writeheader()
                await asyncio.gather(*[_do(r, writer, f) for r in rows])

        rel_key = str(output_path).split("/data/")[-1]
        await _update(
            "COMPLETED",
            processed_count=len(rows),
            output_file_key=rel_key,
            finished_at=datetime.now(timezone.utc),
        )

    except Exception as exc:
        logger.exception("ZeroBounce job %s failed", job_id)
        await _update(
            "FAILED",
            error_message=str(exc),
            finished_at=datetime.now(timezone.utc),
        )
