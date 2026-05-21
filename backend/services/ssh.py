from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

import asyncssh

if TYPE_CHECKING:
    from ..models import VpsInstance


class SshTransfer:
    """SFTP-based file transfer to/from a remote VPS."""

    @staticmethod
    async def push_file(vps: "VpsInstance", local_path: Path, remote_path: str) -> None:
        """Upload a local file to the remote VPS via SFTP."""
        connect_kwargs: dict = {
            "host": vps.ssh_host,
            "port": vps.ssh_port,
            "username": vps.ssh_user,
            "known_hosts": None,
        }
        if vps.ssh_key_path:
            connect_kwargs["client_keys"] = [vps.ssh_key_path]

        try:
            async with asyncssh.connect(**connect_kwargs) as conn:
                async with conn.start_sftp_client() as sftp:
                    remote_dir = remote_path.rsplit("/", 1)[0]
                    await sftp.makedirs(remote_dir, exist_ok=True)
                    await sftp.put(str(local_path), remote_path)
        except (asyncssh.Error, OSError) as exc:
            raise RuntimeError(
                f"SSH push to {vps.ssh_host}:{remote_path} failed: {exc}"
            ) from exc

    @staticmethod
    async def pull_file(vps: "VpsInstance", remote_path: str, local_path: Path) -> None:
        """Download a file from the remote VPS via SFTP."""
        connect_kwargs: dict = {
            "host": vps.ssh_host,
            "port": vps.ssh_port,
            "username": vps.ssh_user,
            "known_hosts": None,
        }
        if vps.ssh_key_path:
            connect_kwargs["client_keys"] = [vps.ssh_key_path]

        try:
            async with asyncssh.connect(**connect_kwargs) as conn:
                async with conn.start_sftp_client() as sftp:
                    local_path.parent.mkdir(parents=True, exist_ok=True)
                    await sftp.get(remote_path, str(local_path))
        except (asyncssh.Error, OSError) as exc:
            raise RuntimeError(
                f"SSH pull from {vps.ssh_host}:{remote_path} failed: {exc}"
            ) from exc
