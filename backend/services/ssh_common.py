from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ..models import VpsInstance


def build_connect_kwargs(vps: "VpsInstance") -> dict[str, Any]:
    """asyncssh.connect kwargs for a VPS row. Host keys are not pinned (known_hosts=None)."""
    kwargs: dict[str, Any] = {
        "host": vps.ssh_host,
        "port": vps.ssh_port,
        "username": vps.ssh_user,
        "known_hosts": None,
    }
    if vps.ssh_key_path:
        kwargs["client_keys"] = [vps.ssh_key_path]
    return kwargs
