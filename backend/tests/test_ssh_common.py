from __future__ import annotations

from types import SimpleNamespace

import pytest

from backend.services.ssh_common import build_connect_kwargs


def _vps(**overrides) -> SimpleNamespace:
    fields = {
        "name": "test-vps",
        "ssh_host": "worker.example.com",
        "ssh_port": 22,
        "ssh_user": "devonly",
        "ssh_key_path": "/root/.ssh/id_worker_v3",
        **overrides,
    }
    return SimpleNamespace(**fields)


def test_build_connect_kwargs_happy_path() -> None:
    kwargs = build_connect_kwargs(_vps())
    assert kwargs["host"] == "worker.example.com"
    assert kwargs["client_keys"] == ["/root/.ssh/id_worker_v3"]


def test_build_connect_kwargs_omits_client_keys_when_unset() -> None:
    kwargs = build_connect_kwargs(_vps(ssh_key_path=None))
    assert "client_keys" not in kwargs


def test_build_connect_kwargs_rejects_missing_ssh_host() -> None:
    """Regression test: passing host=None straight into asyncssh.connect()
    raised a bare TypeError, uncaught by every caller's narrow
    except (asyncssh.Error, OSError), the raw exception text ended up
    stored verbatim in a job's error_message and returned by the API.
    Reproduced live: an is_local=True VPS created with no ssh_host (a
    combination the schema allows) crashed every job dispatched to it with
    "expected str, bytes or os.PathLike object" leaking straight through."""
    with pytest.raises(RuntimeError, match="has no ssh_host configured"):
        build_connect_kwargs(_vps(ssh_host=None))
