from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest

from backend.services import worker as worker_mod
from backend.services.worker import WorkerClient


def _vps(
    repo_dir: str = "/home/devonly/projects/universal-scraper-v3",
) -> SimpleNamespace:
    return SimpleNamespace(
        ssh_host="worker.example.com",
        ssh_user="devonly",
        ssh_port=22,
        ssh_key_path="/root/.ssh/id_worker_v3",
        data_dir="/home/devonly/data",
        repo_dir=repo_dir,
    )


class _FakeRun:
    def __init__(
        self, stdout: str = "", exit_status: int = 0, stderr: str = ""
    ) -> None:
        self.stdout = stdout
        self.exit_status = exit_status
        self.stderr = stderr


class _FakeConn:
    def __init__(self, run_result: _FakeRun) -> None:
        self._run_result = run_result
        self.commands: list[str] = []

    async def run(self, cmd: str, timeout: float | None = None) -> _FakeRun:
        self.commands.append(cmd)
        return self._run_result

    async def __aenter__(self) -> "_FakeConn":
        return self

    async def __aexit__(self, *exc) -> None:
        return None


@pytest.fixture
def patched_connect(monkeypatch):
    """Patch asyncssh.connect to return a fake connection; expose it for assertions."""
    holder: dict = {}

    def _factory(run_result: _FakeRun) -> None:
        conn = _FakeConn(run_result)
        holder["conn"] = conn

        def _connect(**kwargs):
            holder["kwargs"] = kwargs
            return conn

        monkeypatch.setattr(worker_mod.asyncssh, "connect", _connect)

    holder["setup"] = _factory
    return holder


# ── status mapping ────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "token,expected_status,has_error",
    [
        ("DONE", "COMPLETED", False),
        ("RUNNING", "RUNNING", False),
        ("GONE", "FAILED", True),
        ("FAILED:1", "FAILED", True),
        ("FAILED:137", "FAILED", True),
        ("FAILED:0", "FAILED", True),
        ("", "RUNNING", False),
        ("garbage", "RUNNING", False),
    ],
)
def test_map_status(token, expected_status, has_error) -> None:
    status, error = WorkerClient._map_status(token)
    assert status == expected_status
    assert (error is not None) == has_error


async def test_get_status_reads_sentinel(patched_connect) -> None:
    patched_connect["setup"](_FakeRun(stdout="DONE\n"))
    client = WorkerClient(_vps())
    job_id = uuid.uuid4()

    status, error = await client.get_status(job_id)
    assert status == "COMPLETED"
    assert error is None
    probe = patched_connect["conn"].commands[0]
    assert f"job-{job_id}" in probe
    assert f"jobs/{job_id}/exit_code" in probe


# ── trigger ───────────────────────────────────────────────────────────────────


async def test_trigger_launches_tmux_without_inline_secrets(patched_connect) -> None:
    patched_connect["setup"](_FakeRun(exit_status=0))
    client = WorkerClient(_vps())
    job_id = uuid.uuid4()
    config = SimpleNamespace(
        enable_proxy=False,
        skip_duplicates=True,
        serper_api_key="secret-serper",
    )

    session = await client.trigger(job_id, f"inputs/{job_id}/input.jsonl", config)

    assert session == f"job-{job_id}"
    cmd = patched_connect["conn"].commands[0]
    # tmux session launched, env file sourced, entrypoint run, sentinel written
    assert f"tmux new-session -d -s job-{job_id}" in cmd
    assert ".venv/bin/python entrypoint.py" in cmd
    assert "exit_code" in cmd
    # CONFIG is JSON with spaces — it MUST be single-quoted in the env file so
    # `set -a; . job.env` doesn't word-split it (regression: lost CONFIG → defaults).
    assert 'CONFIG=\'{"enable_proxy": false, "skip_duplicates": true}\'' in cmd
    # Secret goes into the env file body, never onto the command line directly
    assert "SERPER_API_KEY=secret-serper" in cmd  # inside the heredoc body
    assert "-e SERPER_API_KEY=secret-serper" not in cmd


async def test_trigger_raises_on_nonzero_exit(patched_connect) -> None:
    patched_connect["setup"](_FakeRun(exit_status=1, stderr="boom"))
    client = WorkerClient(_vps())
    config = SimpleNamespace(
        enable_proxy=False,
        skip_duplicates=True,
        serper_api_key=None,
    )

    with pytest.raises(RuntimeError, match="tmux launch failed"):
        await client.trigger(uuid.uuid4(), "inputs/x/input.jsonl", config)


# ── cancel / has_active_session ───────────────────────────────────────────────


async def test_cancel_kills_session(patched_connect) -> None:
    patched_connect["setup"](_FakeRun(exit_status=0))
    client = WorkerClient(_vps(repo_dir="/repo"))
    job_id = uuid.uuid4()

    await client.cancel(job_id)
    assert f"tmux kill-session -t job-{job_id}" in patched_connect["conn"].commands[0]


async def test_has_active_session(patched_connect) -> None:
    patched_connect["setup"](_FakeRun(stdout="2\n"))
    client = WorkerClient(_vps(repo_dir="/repo"))
    assert await client.has_active_session() is True

    patched_connect["setup"](_FakeRun(stdout="0\n"))
    client = WorkerClient(_vps(repo_dir="/repo"))
    assert await client.has_active_session() is False
