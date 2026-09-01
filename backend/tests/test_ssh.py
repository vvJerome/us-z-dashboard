from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import asyncssh
import pytest

from backend.services import ssh as ssh_mod
from backend.services.ssh import SshTransfer


def _vps() -> SimpleNamespace:
    return SimpleNamespace(
        ssh_host="worker.example.com",
        ssh_user="devonly",
        ssh_port=22,
        ssh_key_path="/root/.ssh/id_worker_v3",
    )


class _FakeSftp:
    def __init__(self) -> None:
        self.made_dirs: list[str] = []
        self.put_calls: list[tuple[str, str]] = []
        self.get_calls: list[tuple[str, str]] = []

    async def makedirs(self, path: str, exist_ok: bool = False) -> None:
        self.made_dirs.append(path)

    async def put(self, local: str, remote: str) -> None:
        self.put_calls.append((local, remote))

    async def get(self, remote: str, local: str) -> None:
        self.get_calls.append((remote, local))

    async def __aenter__(self) -> "_FakeSftp":
        return self

    async def __aexit__(self, *exc) -> None:
        return None


class _FakeConn:
    def __init__(self, sftp: _FakeSftp) -> None:
        self._sftp = sftp

    def start_sftp_client(self) -> _FakeSftp:
        return self._sftp

    async def __aenter__(self) -> "_FakeConn":
        return self

    async def __aexit__(self, *exc) -> None:
        return None


@pytest.fixture
def patched_connect(monkeypatch):
    holder: dict = {}

    def _factory(sftp: _FakeSftp | None = None) -> None:
        sftp = sftp or _FakeSftp()
        conn = _FakeConn(sftp)
        holder["sftp"] = sftp
        holder["conn"] = conn

        def _connect(**kwargs):
            holder["kwargs"] = kwargs
            return conn

        monkeypatch.setattr(ssh_mod.asyncssh, "connect", _connect)

    holder["setup"] = _factory
    return holder


@pytest.fixture
def failing_connect(monkeypatch):
    def _connect(**kwargs):
        raise asyncssh.Error(1, "connection refused")

    monkeypatch.setattr(ssh_mod.asyncssh, "connect", _connect)


async def test_push_file_creates_remote_dir_and_uploads(
    patched_connect, tmp_path: Path
) -> None:
    patched_connect["setup"]()
    local = tmp_path / "input.jsonl"
    local.write_text("data")

    await SshTransfer.push_file(_vps(), local, "/home/devonly/data/inputs/job-1/x")

    sftp = patched_connect["sftp"]
    assert sftp.made_dirs == ["/home/devonly/data/inputs/job-1"]
    assert sftp.put_calls == [(str(local), "/home/devonly/data/inputs/job-1/x")]


async def test_push_file_wraps_ssh_error(
    patched_connect, failing_connect, tmp_path: Path
) -> None:
    local = tmp_path / "input.jsonl"
    local.write_text("data")

    with pytest.raises(RuntimeError, match="SSH push"):
        await SshTransfer.push_file(_vps(), local, "/data/inputs/job-1/x")


async def test_pull_file_creates_local_dir_and_downloads(
    patched_connect, tmp_path: Path
) -> None:
    patched_connect["setup"]()
    local = tmp_path / "outputs" / "job-1" / "result.csv"

    await SshTransfer.pull_file(_vps(), "/data/outputs/job-1/result.csv", local)

    assert local.parent.is_dir()
    sftp = patched_connect["sftp"]
    assert sftp.get_calls == [("/data/outputs/job-1/result.csv", str(local))]


async def test_pull_file_wraps_ssh_error(failing_connect, tmp_path: Path) -> None:
    local = tmp_path / "result.csv"

    with pytest.raises(RuntimeError, match="SSH pull"):
        await SshTransfer.pull_file(_vps(), "/data/result.csv", local)
