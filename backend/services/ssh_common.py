from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ..models import VpsInstance


def build_connect_kwargs(vps: "VpsInstance") -> dict[str, Any]:
    """asyncssh.connect kwargs for a VPS row. Host keys are not pinned (known_hosts=None).

    Raises RuntimeError if ssh_host is unset, passing host=None straight into
    asyncssh.connect() raises a bare TypeError, which every caller's narrow
    except (asyncssh.Error, OSError) doesn't catch. That TypeError's raw text
    ("expected str, bytes or os.PathLike object...") ends up stored verbatim
    in the job's error_message and returned by the API, an internal-detail
    leak security.md prohibits, regardless of what "is_local" is meant to do.
    """
    if not vps.ssh_host:
        raise RuntimeError(f"VPS {vps.name!r} has no ssh_host configured")
    kwargs: dict[str, Any] = {
        "host": vps.ssh_host,
        "port": vps.ssh_port,
        "username": vps.ssh_user,
        "known_hosts": None,
    }
    if vps.ssh_key_path:
        kwargs["client_keys"] = [vps.ssh_key_path]
    return kwargs
