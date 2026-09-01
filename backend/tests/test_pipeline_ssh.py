from __future__ import annotations

import shlex
import sqlite3
from types import SimpleNamespace
from unittest.mock import AsyncMock

import asyncssh
import pytest

from backend.services import pipeline_ssh as pipeline_ssh_mod
from backend.services.pipeline_ssh import (
    _assemble_snapshot,
    _run_query_ssh,
    fetch_metrics,
)


def _vps(is_local: bool = False) -> SimpleNamespace:
    return SimpleNamespace(
        is_local=is_local,
        ssh_host="worker.example.com",
        ssh_user="devonly",
        ssh_port=22,
        ssh_key_path="/root/.ssh/id_worker_v3",
    )


class FakeResult:
    def __init__(self, exit_status: int, stdout: str = "", stderr: str = "") -> None:
        self.exit_status = exit_status
        self.stdout = stdout
        self.stderr = stderr


class TestRunQuerySshQuoting:
    """Regression coverage for the command-injection fix: db_path (derived
    from the user-controlled VpsInstance.data_dir) must never be interpolated
    into the remote shell command unescaped.
    """

    async def test_malicious_db_path_is_shell_quoted_not_executed(self) -> None:
        conn = AsyncMock()
        conn.run.return_value = FakeResult(0, stdout="[]")

        malicious = '/data"; touch /tmp/pwned; echo "'
        await _run_query_ssh(conn, malicious, "SELECT 1")

        sent_command = conn.run.call_args.args[0]
        # shlex.split must round-trip the malicious value back to a single
        # literal argument, if it doesn't, the shell would have split it
        # into multiple commands.
        parts = shlex.split(sent_command)
        assert malicious in parts
        assert "touch" not in [p for p in parts if p != malicious]

    async def test_sql_with_double_quotes_is_shell_quoted(self) -> None:
        conn = AsyncMock()
        conn.run.return_value = FakeResult(0, stdout="[]")

        sql = 'SELECT * FROM t WHERE x = "y"'
        await _run_query_ssh(conn, "/data/db.sqlite", sql)

        sent_command = conn.run.call_args.args[0]
        parts = shlex.split(sent_command)
        assert sql in parts

    async def test_sqlite_missing_raises_runtime_error(self) -> None:
        conn = AsyncMock()
        conn.run.return_value = FakeResult(127)
        with pytest.raises(RuntimeError, match="sqlite3 CLI not found"):
            await _run_query_ssh(conn, "/data/db.sqlite", "SELECT 1")

    async def test_returns_parsed_json_on_success(self) -> None:
        conn = AsyncMock()
        conn.run.return_value = FakeResult(0, stdout='[{"a": 1}]')
        result = await _run_query_ssh(conn, "/data/db.sqlite", "SELECT 1")
        assert result == [{"a": 1}]

    async def test_empty_stdout_on_nonzero_exit_returns_empty_list(self) -> None:
        conn = AsyncMock()
        conn.run.return_value = FakeResult(1, stdout="")
        result = await _run_query_ssh(conn, "/data/db.sqlite", "SELECT 1")
        assert result == []

    async def test_nonzero_exit_with_stdout_raises_runtime_error(self) -> None:
        conn = AsyncMock()
        conn.run.return_value = FakeResult(
            1, stdout="partial output", stderr="database is locked"
        )
        with pytest.raises(RuntimeError, match="sqlite3 error"):
            await _run_query_ssh(conn, "/data/db.sqlite", "SELECT 1")

    async def test_malformed_json_returns_empty_list(self) -> None:
        conn = AsyncMock()
        conn.run.return_value = FakeResult(0, stdout="not json")
        result = await _run_query_ssh(conn, "/data/db.sqlite", "SELECT 1")
        assert result == []


class TestFetchMetrics:
    """fetch_metrics() is the public entrypoint routers/vps.py calls - covers
    both the local (direct sqlite3) and remote (SSH + CLI) paths, which were
    previously only ever exercised indirectly via a router-level mock.
    """

    async def test_local_vps_with_no_tables_returns_zeroed_snapshot(
        self, tmp_path
    ) -> None:
        db_path = tmp_path / "pipeline.db"
        sqlite3.connect(db_path).close()  # empty file, no schema at all

        snapshot = await fetch_metrics(_vps(is_local=True), str(db_path))

        assert snapshot["totals"]["all"] == 0
        assert snapshot["heartbeats"] == {"producer": None, "dispatcher": None}

    async def test_remote_vps_assembles_snapshot_from_ssh_queries(
        self, monkeypatch
    ) -> None:
        conn = AsyncMock()
        conn.run.return_value = FakeResult(0, stdout="[]")
        conn.__aenter__.return_value = conn
        # AsyncMock's default __aexit__ return is truthy, which would silently
        # swallow any exception raised inside the `async with` block.
        conn.__aexit__.return_value = False
        monkeypatch.setattr(pipeline_ssh_mod.asyncssh, "connect", lambda **kwargs: conn)

        snapshot = await fetch_metrics(_vps(is_local=False), "/data/pipeline.db")

        assert snapshot["totals"]["all"] == 0
        assert conn.run.await_count == len(pipeline_ssh_mod._QUERIES)

    async def test_remote_vps_propagates_missing_sqlite_cli(self, monkeypatch) -> None:
        conn = AsyncMock()
        conn.run.return_value = FakeResult(127)
        conn.__aenter__.return_value = conn
        # AsyncMock's default __aexit__ return is truthy, which would silently
        # swallow any exception raised inside the `async with` block.
        conn.__aexit__.return_value = False
        monkeypatch.setattr(pipeline_ssh_mod.asyncssh, "connect", lambda **kwargs: conn)

        with pytest.raises(RuntimeError, match="sqlite3 CLI not found"):
            await fetch_metrics(_vps(is_local=False), "/data/pipeline.db")

    async def test_remote_vps_swallows_a_single_query_failure(
        self, monkeypatch
    ) -> None:
        """One query erroring (e.g. a table missing on an older pipeline.db)
        must not fail the whole snapshot - it degrades to an empty result for
        that key only."""
        conn = AsyncMock()
        conn.run.return_value = FakeResult(1, stdout="boom", stderr="no such table")
        conn.__aenter__.return_value = conn
        # AsyncMock's default __aexit__ return is truthy, which would silently
        # swallow any exception raised inside the `async with` block.
        conn.__aexit__.return_value = False
        monkeypatch.setattr(pipeline_ssh_mod.asyncssh, "connect", lambda **kwargs: conn)

        snapshot = await fetch_metrics(_vps(is_local=False), "/data/pipeline.db")

        assert snapshot["totals"]["all"] == 0

    async def test_connect_failure_wrapped_as_runtime_error(self, monkeypatch) -> None:
        def _raise(**kwargs):
            raise asyncssh.Error(1, "connection refused")

        monkeypatch.setattr(pipeline_ssh_mod.asyncssh, "connect", _raise)

        with pytest.raises(RuntimeError, match="SSH connection failed"):
            await fetch_metrics(_vps(is_local=False), "/data/pipeline.db")


class TestAssembleSnapshot:
    def test_empty_results_produce_zeroed_snapshot(self) -> None:
        snapshot = _assemble_snapshot({})
        assert snapshot["totals"] == {"all": 0, "terminal": 0, "pending": 0}
        assert snapshot["rate"]["complete"] is False
        assert snapshot["cost"]["spent_usd"] == 0.0

    def test_complete_run_uses_overall_rate_and_no_eta(self) -> None:
        snapshot = _assemble_snapshot(
            {
                "state_counts": [{"record_state": "VALIDATED", "n": 10}],
                "run_span": [{"elapsed_s": 3600}],
            }
        )
        assert snapshot["totals"]["pending"] == 0
        assert snapshot["rate"]["complete"] is True
        assert snapshot["rate"]["eta_hours"] is None
        assert snapshot["rate"]["per_hour"] == 10

    def test_pending_run_computes_eta_from_last_15_minutes(self) -> None:
        snapshot = _assemble_snapshot(
            {
                "state_counts": [
                    {"record_state": "VALIDATED", "n": 5},
                    {"record_state": "DISCOVERED", "n": 20},
                ],
                "rate_15m": [{"n": 5}],
            }
        )
        assert snapshot["rate"]["complete"] is False
        assert snapshot["rate"]["per_hour"] == 20
        assert snapshot["rate"]["eta_hours"] == 1.0

    def test_cost_breakdown_sums_serper_variants(self) -> None:
        snapshot = _assemble_snapshot(
            {
                "cost_breakdown": [
                    {
                        "serper_producer_calls": 100,
                        "serper_dispatcher_calls": 50,
                        "serper_places_calls": 10,
                    }
                ]
            }
        )
        services = {s["name"]: s for s in snapshot["cost_breakdown"]["services"]}
        assert services["serper"]["calls"] == 160
        assert "zuhal" not in services

    def test_backends_expose_only_smtp(self) -> None:
        snapshot = _assemble_snapshot({"backend_racknerd": [{"v": "valid", "n": 3}]})
        assert set(snapshot["backends"]) == {"smtp"}
        assert snapshot["backends"]["smtp"]["total"] == 3

    def test_heartbeats_default_to_none(self) -> None:
        snapshot = _assemble_snapshot({})
        assert snapshot["heartbeats"] == {"producer": None, "dispatcher": None}

    def test_heartbeats_populated_from_stats_row(self) -> None:
        snapshot = _assemble_snapshot(
            {
                "heartbeats": [
                    {
                        "last_producer_heartbeat": "2026-08-24T12:00:00",
                        "last_dispatcher_heartbeat": "2026-08-24T12:05:00",
                    }
                ]
            }
        )
        assert snapshot["heartbeats"] == {
            "producer": "2026-08-24T12:00:00",
            "dispatcher": "2026-08-24T12:05:00",
        }

    def test_discovery_sums_first_and_third_party_sources(self) -> None:
        # first_party = direct/owned lookups (dns, company_db); third_party =
        # resolved via a search/maps API (serper, serper_fallback, places).
        # The query itself already buckets these (see _QUERIES["discovery"]),
        # so this just locks in that the row's two columns pass through as-is.
        snapshot = _assemble_snapshot(
            {"discovery": [{"first_party": 7, "third_party": 3, "failed": 2}]}
        )
        assert snapshot["discovery"]["first_party"] == 7
        assert snapshot["discovery"]["third_party"] == 3
        assert snapshot["discovery"]["failed"] == 2
        assert snapshot["discovery"]["total_input"] == 12
        assert snapshot["discovery"]["hit_rate_pct"] == round(10 / 12 * 100, 1)

    def test_run_events_default_to_empty_list(self) -> None:
        assert _assemble_snapshot({})["run_events"] == []

    def test_run_events_pass_through_from_query_result(self) -> None:
        snapshot = _assemble_snapshot(
            {
                "run_events": [
                    {
                        "ts": "2026-08-24T12:00:00",
                        "event": "producer_started",
                        "detail": "offset=0",
                    },
                    {
                        "ts": "2026-08-24T12:05:00",
                        "event": "producer_finished",
                        "detail": "processed=100",
                    },
                ]
            }
        )
        assert snapshot["run_events"] == [
            {
                "ts": "2026-08-24T12:00:00",
                "event": "producer_started",
                "detail": "offset=0",
            },
            {
                "ts": "2026-08-24T12:05:00",
                "event": "producer_finished",
                "detail": "processed=100",
            },
        ]
