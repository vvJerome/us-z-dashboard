from __future__ import annotations

import asyncio
import json
import sqlite3
import time
from typing import Any

import asyncssh

from ..models import VpsInstance
from .ssh_common import build_connect_kwargs

TERMINAL_STATES = ("VALIDATED", "VALIDATION_FAILED", "COST_SKIPPED")
PENDING_STATES = ("DISCOVERED", "VALIDATING", "NEEDS_ZUHAL", "ZUHAL_VALIDATING")

# Must mirror the pipeline's own pipeline/constants.py API_COSTS so the dashboard
# cost breakdown reconciles with the pipeline-reported estimated_cost_usd.
API_COSTS = {
    "serper_producer": 0.001,
    "serper_dispatcher": 0.001,
    "serper_places": 0.001,
    "zuhal": 0.001,
}

_QUERIES: dict[str, str] = {
    "state_counts": "SELECT record_state, COUNT(*) AS n FROM records GROUP BY record_state",
    "rate_15m": (
        "SELECT COUNT(*) AS n FROM records"
        " WHERE record_state IN ('VALIDATED','VALIDATION_FAILED')"
        " AND updated_at > datetime('now', '-15 minutes')"
    ),
    "throughput_60min": (
        "SELECT strftime('%H:%M', updated_at) AS minute, COUNT(*) AS count"
        " FROM records"
        " WHERE record_state IN ('VALIDATED','VALIDATION_FAILED')"
        " AND updated_at > datetime('now', '-60 minutes')"
        " GROUP BY 1 ORDER BY 1"
    ),
    "backend_racknerd": (
        "SELECT racknerd_status AS v, COUNT(*) AS n FROM records"
        " WHERE racknerd_status IS NOT NULL GROUP BY 1"
    ),
    "backend_zuhal": (
        "SELECT zuhal_status AS v, COUNT(*) AS n FROM records"
        " WHERE zuhal_status IS NOT NULL GROUP BY 1"
    ),
    "discovery": (
        "SELECT"
        " SUM(CASE WHEN discovery_source='dns' THEN 1 ELSE 0 END) AS dns,"
        " SUM(CASE WHEN discovery_source='serper' THEN 1 ELSE 0 END) AS serper,"
        " SUM(CASE WHEN record_state='DISCOVERY_FAILED' THEN 1 ELSE 0 END) AS failed"
        " FROM records"
    ),
    "cost": "SELECT SUM(estimated_cost_usd) AS estimated_cost_usd FROM stats",
    "cost_breakdown": (
        "SELECT SUM(serper_producer_calls) AS serper_producer_calls,"
        " SUM(serper_dispatcher_calls) AS serper_dispatcher_calls,"
        " SUM(serper_places_calls) AS serper_places_calls,"
        " SUM(zuhal_calls) AS zuhal_calls FROM stats"
    ),
    "run_history": (
        "SELECT strftime('%Y-%m-%dT%H:00', updated_at) AS hour,"
        " SUM(CASE WHEN final_verdict='valid' THEN 1 ELSE 0 END) AS valid,"
        " SUM(CASE WHEN final_verdict='catch_all' THEN 1 ELSE 0 END) AS catch_all,"
        " SUM(CASE WHEN final_verdict='invalid' THEN 1 ELSE 0 END) AS invalid,"
        " SUM(CASE WHEN final_verdict IN ('error','unknown') THEN 1 ELSE 0 END) AS errored,"
        " SUM(CASE WHEN record_state='DISCOVERY_FAILED' THEN 1 ELSE 0 END) AS disc_failed"
        " FROM records"
        " WHERE record_state IN ('VALIDATED','VALIDATION_FAILED','DISCOVERY_FAILED')"
        " AND updated_at IS NOT NULL"
        " GROUP BY 1 ORDER BY 1"
    ),
    "recent_validated": (
        "SELECT unique_id, candidate_email, racknerd_status,"
        " zuhal_status, final_verdict, updated_at"
        " FROM records WHERE record_state = 'VALIDATED'"
        " ORDER BY updated_at DESC, id DESC LIMIT 30"
    ),
    "errors_racknerd": (
        "SELECT 'racknerd' AS source, racknerd_message AS message, COUNT(*) AS n"
        " FROM records WHERE racknerd_status='error'"
        " AND racknerd_message IS NOT NULL AND racknerd_message != ''"
        " AND updated_at > datetime('now', '-60 minutes')"
        " GROUP BY racknerd_message"
    ),
    "run_id": "SELECT run_id FROM stats ORDER BY rowid DESC LIMIT 1",
}


def _assemble_snapshot(results: dict[str, Any]) -> dict[str, Any]:
    t0 = time.monotonic()

    states_raw: list[dict] = results.get("state_counts") or []
    states = {r["record_state"]: r["n"] for r in states_raw}
    total = sum(states.values())
    terminal = sum(states.get(s, 0) for s in TERMINAL_STATES) + states.get(
        "DISCOVERY_FAILED", 0
    )
    pending = sum(states.get(s, 0) for s in PENDING_STATES)

    rate_row = results.get("rate_15m") or [{"n": 0}]
    last_15 = rate_row[0].get("n", 0) if rate_row else 0
    per_hour = last_15 * 4
    eta_hours = round(pending / per_hour, 2) if per_hour > 0 else None

    def _backend(rows: list[dict]) -> dict[str, Any]:
        d = {r["v"]: r["n"] for r in (rows or [])}
        tot = sum(d.values())
        err_pct = round(d.get("error", 0) / tot * 100, 1) if tot else 0.0
        return {**d, "error_pct": err_pct, "total": tot}

    disc_row = (results.get("discovery") or [{}])[0]
    dns = disc_row.get("dns") or 0
    serper = disc_row.get("serper") or 0
    failed = disc_row.get("failed") or 0
    disc_total = dns + serper + failed
    hit_rate = round((dns + serper) / disc_total * 100, 1) if disc_total else 0.0

    cost_row = (results.get("cost") or [{}])[0] if results.get("cost") else {}
    spent = round(cost_row.get("estimated_cost_usd") or 0.0, 4)

    cb_row = (
        (results.get("cost_breakdown") or [{}])[0]
        if results.get("cost_breakdown")
        else {}
    )
    sp = cb_row.get("serper_producer_calls") or 0
    sd = cb_row.get("serper_dispatcher_calls") or 0
    spl = cb_row.get("serper_places_calls") or 0
    zu = cb_row.get("zuhal_calls") or 0
    serper_cost = (
        sp * API_COSTS["serper_producer"]
        + sd * API_COSTS["serper_dispatcher"]
        + spl * API_COSTS["serper_places"]
    )
    services = [
        {
            "name": "serper",
            "calls": sp + sd + spl,
            "cost_usd": round(serper_cost, 4),
        },
        {"name": "zuhal", "calls": zu, "cost_usd": round(zu * API_COSTS["zuhal"], 4)},
    ]

    errors = [dict(r) for r in (results.get("errors_racknerd") or [])]
    errors.sort(key=lambda x: x.get("n", 0), reverse=True)
    for e in errors:
        if e.get("message") and len(e["message"]) > 140:
            e["message"] = e["message"][:137] + "..."

    run_id_row = (results.get("run_id") or [{}])[0] if results.get("run_id") else {}
    run_id_val = run_id_row.get("run_id") if run_id_row else None

    build_ms = round((time.monotonic() - t0) * 1000)

    return {
        "run_id": run_id_val,
        "as_of": __import__("datetime").datetime.utcnow().isoformat(timespec="seconds"),
        "build_ms": build_ms,
        "states": states,
        "totals": {"all": total, "terminal": terminal, "pending": pending},
        "rate": {"last_15min": last_15, "per_hour": per_hour, "eta_hours": eta_hours},
        "throughput_60min": [
            {"minute": r["minute"], "count": r["count"]}
            for r in (results.get("throughput_60min") or [])
        ],
        "backends": {
            "racknerd": _backend(results.get("backend_racknerd")),
            "zuhal": _backend(results.get("backend_zuhal")),
        },
        "discovery": {
            "dns": dns,
            "serper": serper,
            "failed": failed,
            "total_input": disc_total,
            "hit_rate_pct": hit_rate,
        },
        "cost": {"spent_usd": spent, "ceiling_usd": None, "pct": None},
        "cost_breakdown": {"services": services},
        "run_history": [dict(r) for r in (results.get("run_history") or [])],
        "recent_validated": [dict(r) for r in (results.get("recent_validated") or [])],
        "top_recent_errors": errors[:10],
    }


def _query_local(db_path: str) -> dict[str, Any]:
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 2000")
    results: dict[str, Any] = {}
    try:
        for key, sql in _QUERIES.items():
            try:
                results[key] = [dict(r) for r in conn.execute(sql).fetchall()]
            except sqlite3.OperationalError:
                results[key] = []
    finally:
        conn.close()
    return _assemble_snapshot(results)


async def _run_query_ssh(
    conn: asyncssh.SSHClientConnection, db_path: str, sql: str
) -> list[dict]:
    escaped = sql.replace('"', '\\"')
    result = await conn.run(
        f'/usr/bin/sqlite3 -json "{db_path}" "{escaped}"',
        timeout=10,
    )
    if result.exit_status == 127:
        raise RuntimeError(
            "sqlite3 CLI not found on VPS — install with: apt-get install sqlite3"
        )
    if result.exit_status != 0:
        stdout = (result.stdout or "").strip()
        if not stdout:
            return []
        raise RuntimeError(f"sqlite3 error: {result.stderr or result.stdout}")
    stdout = (result.stdout or "").strip()
    if not stdout:
        return []
    try:
        return json.loads(stdout)
    except json.JSONDecodeError:
        return []


async def fetch_metrics(vps: VpsInstance, db_path: str) -> dict[str, Any]:
    if vps.is_local:
        return await asyncio.to_thread(_query_local, db_path)

    try:
        async with asyncssh.connect(**build_connect_kwargs(vps)) as conn:
            results: dict[str, Any] = {}
            for key, sql in _QUERIES.items():
                try:
                    results[key] = await _run_query_ssh(conn, db_path, sql)
                except RuntimeError as e:
                    if "sqlite3 CLI not found" in str(e):
                        raise
                    results[key] = []
            return _assemble_snapshot(results)
    except asyncssh.Error as e:
        raise RuntimeError(f"SSH connection failed: {e}") from e
