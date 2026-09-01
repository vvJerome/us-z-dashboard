from __future__ import annotations

import asyncio
import json
import shlex
import sqlite3
import time
from typing import Any

import asyncssh

from ..models import VpsInstance
from .ssh_common import build_connect_kwargs

TERMINAL_STATES = ("VALIDATED", "VALIDATION_FAILED", "COST_SKIPPED")
PENDING_STATES = ("DISCOVERED", "VALIDATING")

# Must mirror the pipeline's own pipeline/constants.py API_COSTS so the dashboard
# cost breakdown reconciles with the pipeline-reported estimated_cost_usd.
API_COSTS = {
    "serper_producer": 0.001,
    "serper_dispatcher": 0.001,
    "serper_places": 0.001,
}

_QUERIES: dict[str, str] = {
    "state_counts": "SELECT record_state, COUNT(*) AS n FROM records GROUP BY record_state",
    # Windows are anchored to the run's latest activity (MAX(updated_at)), not
    # wall-clock now, so a finished run still shows its throughput/chart instead
    # of zeros. For a live run MAX(updated_at) ~= now, so behavior is unchanged.
    "rate_15m": (
        "SELECT COUNT(*) AS n FROM records"
        " WHERE record_state IN ('VALIDATED','VALIDATION_FAILED')"
        " AND updated_at > (SELECT datetime(MAX(updated_at), '-15 minutes') FROM records)"
    ),
    "throughput_60min": (
        "SELECT strftime('%H:%M', updated_at) AS minute, COUNT(*) AS count"
        " FROM records"
        " WHERE record_state IN ('VALIDATED','VALIDATION_FAILED')"
        " AND updated_at > (SELECT datetime(MAX(updated_at), '-60 minutes') FROM records)"
        " GROUP BY 1 ORDER BY 1"
    ),
    "run_span": (
        "SELECT (julianday(MAX(updated_at)) - julianday(MIN(created_at))) * 86400.0"
        " AS elapsed_s FROM records"
        " WHERE record_state IN ('VALIDATED','VALIDATION_FAILED','COST_SKIPPED','DISCOVERY_FAILED')"
    ),
    "backend_racknerd": (
        "SELECT racknerd_status AS v, COUNT(*) AS n FROM records"
        " WHERE racknerd_status IS NOT NULL GROUP BY 1"
    ),
    # discovery_source has 5 real values (see pipeline/discovery_candidates.py):
    # dns and company_db are direct/owned lookups against the business's own
    # records (first-party); serper, serper_fallback, and places all resolve a
    # candidate through a third-party search/maps API. The previous query only
    # summed 'dns' and 'serper', so company_db/places/serper_fallback hits were
    # silently missing from both the counts and the hit-rate percentage.
    "discovery": (
        "SELECT"
        " SUM(CASE WHEN discovery_source IN ('dns','company_db') THEN 1 ELSE 0 END)"
        " AS first_party,"
        " SUM(CASE WHEN discovery_source IN ('serper','serper_fallback','places')"
        " THEN 1 ELSE 0 END) AS third_party,"
        " SUM(CASE WHEN record_state='DISCOVERY_FAILED' THEN 1 ELSE 0 END) AS failed"
        " FROM records"
    ),
    "cost": "SELECT SUM(estimated_cost_usd) AS estimated_cost_usd FROM stats",
    "cost_breakdown": (
        "SELECT SUM(serper_producer_calls) AS serper_producer_calls,"
        " SUM(serper_dispatcher_calls) AS serper_dispatcher_calls,"
        " SUM(serper_places_calls) AS serper_places_calls"
        " FROM stats"
    ),
    # canonical_status (see pipeline/verdicts.py) is the pipeline's own single
    # normalized verdict - it's final_verdict passed through normalize_verdict(),
    # then overwritten with the ZeroBounce ground truth once that's ingested, so
    # it's strictly at least as accurate as final_verdict and more accurate for
    # any record ZeroBounce has reconciled. do_not_mail/abuse/disposable are rare
    # ZeroBounce-only outcomes, folded into the same "errored" bucket as unknown.
    "run_history": (
        "SELECT strftime('%Y-%m-%dT%H:00', updated_at) AS hour,"
        " SUM(CASE WHEN canonical_status='valid' THEN 1 ELSE 0 END) AS valid,"
        " SUM(CASE WHEN canonical_status='catch_all' THEN 1 ELSE 0 END) AS catch_all,"
        " SUM(CASE WHEN canonical_status='invalid' THEN 1 ELSE 0 END) AS invalid,"
        " SUM(CASE WHEN canonical_status IN"
        " ('unknown','do_not_mail','abuse','disposable') THEN 1 ELSE 0 END) AS errored"
        " FROM records"
        " WHERE record_state IN ('VALIDATED','VALIDATION_FAILED')"
        " AND updated_at IS NOT NULL"
        " GROUP BY 1 ORDER BY 1"
    ),
    # Every row is one discovered candidate (successful or not), so this is the
    # true per-hour discovery volume - bucketed by created_at (when the record
    # was discovered), not updated_at (when it finished validation), since a
    # record discovered this hour may not reach a terminal outcome for a while.
    "discovery_history": (
        "SELECT strftime('%Y-%m-%dT%H:00', created_at) AS hour, COUNT(*) AS n"
        " FROM records WHERE created_at IS NOT NULL"
        " GROUP BY 1 ORDER BY 1"
    ),
    "recent_validated": (
        "SELECT unique_id, candidate_email, racknerd_status,"
        " canonical_status, canonical_source, updated_at"
        " FROM records WHERE record_state = 'VALIDATED'"
        " ORDER BY updated_at DESC, id DESC LIMIT 30"
    ),
    # Genuine backend errors for the whole run (per-job DB, so no wall-clock
    # window). Routine validation outcomes (failure_reason like infra_loop /
    # max_attempts) are NOT errors and are intentionally excluded.
    "errors_racknerd": (
        "SELECT 'proxy25' AS source, racknerd_message AS message, COUNT(*) AS n"
        " FROM records WHERE racknerd_status='error'"
        " AND racknerd_message IS NOT NULL AND racknerd_message != ''"
        " GROUP BY racknerd_message"
    ),
    "run_id": "SELECT run_id FROM stats ORDER BY rowid DESC LIMIT 1",
    "heartbeats": (
        "SELECT last_producer_heartbeat, last_dispatcher_heartbeat"
        " FROM stats ORDER BY rowid DESC LIMIT 1"
    ),
    # Append-only run lifecycle timeline (pipeline/db/meta.py::record_run_event) -
    # producer/dispatcher start+finish, the ZeroBounce gate, and manual halts.
    # Previously unused by the dashboard entirely.
    "run_events": "SELECT ts, event, detail FROM run_events ORDER BY id DESC LIMIT 20",
}


def _merge_run_history(
    outcome_rows: list[dict[str, Any]], discovery_rows: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Union validation-outcome hours (keyed by updated_at) with discovery-volume
    hours (keyed by created_at) into one sorted per-hour timeline."""
    outcomes = {r["hour"]: r for r in outcome_rows}
    discovered = {r["hour"]: r["n"] for r in discovery_rows}
    hours = sorted(set(outcomes) | set(discovered))
    return [
        {
            "hour": hour,
            "valid": outcomes.get(hour, {}).get("valid", 0),
            "catch_all": outcomes.get(hour, {}).get("catch_all", 0),
            "invalid": outcomes.get(hour, {}).get("invalid", 0),
            "errored": outcomes.get(hour, {}).get("errored", 0),
            "discovery": discovered.get(hour, 0),
        }
        for hour in hours
    ]


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
    live_per_hour = last_15 * 4

    # Overall run rate: processed terminal records over the run's elapsed time.
    span_row = (results.get("run_span") or [{}])[0] if results.get("run_span") else {}
    elapsed_s = span_row.get("elapsed_s") or 0
    overall_per_hour = round(terminal / (elapsed_s / 3600.0)) if elapsed_s > 0 else 0

    # A run is "complete" once nothing is pending and something finished. Then the
    # headline shows the overall rate and ETA reads "done" (no work left to estimate).
    complete = pending == 0 and terminal > 0
    if complete:
        per_hour = overall_per_hour
        eta_hours = None
    else:
        per_hour = live_per_hour
        eta_hours = round(pending / per_hour, 2) if per_hour > 0 else None

    def _backend(rows: list[dict]) -> dict[str, Any]:
        d = {r["v"]: r["n"] for r in (rows or [])}
        tot = sum(d.values())
        err_pct = round(d.get("error", 0) / tot * 100, 1) if tot else 0.0
        return {**d, "error_pct": err_pct, "total": tot}

    disc_row = (results.get("discovery") or [{}])[0]
    first_party = disc_row.get("first_party") or 0
    third_party = disc_row.get("third_party") or 0
    failed = disc_row.get("failed") or 0
    disc_total = first_party + third_party + failed
    hit_rate = (
        round((first_party + third_party) / disc_total * 100, 1) if disc_total else 0.0
    )

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
    ]

    errors = [dict(r) for r in (results.get("errors_racknerd") or [])]
    errors.sort(key=lambda x: x.get("n", 0), reverse=True)
    for e in errors:
        if e.get("message") and len(e["message"]) > 140:
            e["message"] = e["message"][:137] + "..."

    run_id_row = (results.get("run_id") or [{}])[0] if results.get("run_id") else {}
    run_id_val = run_id_row.get("run_id") if run_id_row else None

    hb_row = (results.get("heartbeats") or [{}])[0] if results.get("heartbeats") else {}
    heartbeats = {
        "producer": hb_row.get("last_producer_heartbeat"),
        "dispatcher": hb_row.get("last_dispatcher_heartbeat"),
    }

    build_ms = round((time.monotonic() - t0) * 1000)

    return {
        "run_id": run_id_val,
        "as_of": __import__("datetime").datetime.utcnow().isoformat(timespec="seconds"),
        "build_ms": build_ms,
        "states": states,
        "totals": {"all": total, "terminal": terminal, "pending": pending},
        "rate": {
            "last_15min": last_15,
            "per_hour": per_hour,
            "eta_hours": eta_hours,
            "complete": complete,
        },
        "throughput_60min": [
            {"minute": r["minute"], "count": r["count"]}
            for r in (results.get("throughput_60min") or [])
        ],
        "backends": {
            "smtp": _backend(results.get("backend_racknerd")),
        },
        "heartbeats": heartbeats,
        "discovery": {
            "first_party": first_party,
            "third_party": third_party,
            "failed": failed,
            "total_input": disc_total,
            "hit_rate_pct": hit_rate,
        },
        "cost": {"spent_usd": spent, "ceiling_usd": None, "pct": None},
        "cost_breakdown": {"services": services},
        "run_history": _merge_run_history(
            results.get("run_history") or [], results.get("discovery_history") or []
        ),
        "recent_validated": [dict(r) for r in (results.get("recent_validated") or [])],
        "top_recent_errors": errors[:10],
        "run_events": [dict(r) for r in (results.get("run_events") or [])],
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
    command = f"/usr/bin/sqlite3 -json {shlex.quote(db_path)} {shlex.quote(sql)}"
    result = await conn.run(command, timeout=10)
    if result.exit_status == 127:
        raise RuntimeError(
            "sqlite3 CLI not found on VPS, install with: apt-get install sqlite3"
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
