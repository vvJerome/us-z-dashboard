from __future__ import annotations

import json
import shlex
import uuid
from typing import TYPE_CHECKING

import asyncssh

from .ssh_common import build_connect_kwargs

if TYPE_CHECKING:
    from ..models import VpsInstance
    from ..schemas.jobs import JobConfig


def session_name(job_id: uuid.UUID) -> str:
    return f"job-{job_id}"


class WorkerClient:
    """Triggers and tracks pipeline runs on the worker VPS over SSH + tmux.

    A run is one tmux session executing `entrypoint.py` in the pipeline venv. The
    session's command appends its exit code to a sentinel file; status is derived
    from that sentinel plus the presence of the result CSV and tmux liveness.
    """

    def __init__(self, vps: "VpsInstance", repo_dir: str) -> None:
        self._vps = vps
        self._repo_dir = repo_dir
        self._data_dir = vps.data_dir

    async def trigger(
        self, job_id: uuid.UUID, input_file_key: str, config: "JobConfig"
    ) -> str:
        """Write the per-job env file, then launch the pipeline in a tmux session.

        Returns the tmux session name (stored as the job's worker_session handle).
        """
        session = session_name(job_id)
        job_dir = f"{self._data_dir}/jobs/{job_id}"
        env_file = f"{job_dir}/job.env"
        exit_file = f"{job_dir}/exit_code"

        env_body = self._build_env_file(job_id, input_file_key, config)
        inner = (
            f"set -a; . {shlex.quote(self._repo_dir)}/.env 2>/dev/null; "
            f". {shlex.quote(env_file)}; set +a; "
            f"cd {shlex.quote(self._repo_dir)} && .venv/bin/python entrypoint.py; "
            f"echo $? > {shlex.quote(exit_file)}"
        )
        launch = (
            f"mkdir -p {shlex.quote(job_dir)} && "
            f"cat > {shlex.quote(env_file)} <<'JOBENV'\n{env_body}\nJOBENV\n"
            f"chmod 600 {shlex.quote(env_file)} && "
            f"tmux new-session -d -s {shlex.quote(session)} {shlex.quote(inner)}"
        )

        try:
            async with asyncssh.connect(**build_connect_kwargs(self._vps)) as conn:
                result = await conn.run(launch, timeout=30)
        except (asyncssh.Error, OSError) as exc:
            raise RuntimeError(
                f"Failed to launch pipeline on {self._vps.ssh_host}: {exc}"
            ) from exc
        if result.exit_status != 0:
            raise RuntimeError(
                f"tmux launch failed on {self._vps.ssh_host}: "
                f"{(result.stderr or '').strip() or result.exit_status}"
            )
        return session

    async def get_status(self, job_id: uuid.UUID) -> tuple[str, str | None]:
        """Resolve the job's status in one round trip. Returns (status, error_message)."""
        job_dir = f"{self._data_dir}/jobs/{job_id}"
        exit_file = f"{job_dir}/exit_code"
        result_csv = f"{self._data_dir}/outputs/{job_id}/result.csv"
        session = session_name(job_id)
        probe = (
            f"if [ -f {shlex.quote(exit_file)} ]; then "
            f"ec=$(cat {shlex.quote(exit_file)}); "
            f'if [ "$ec" = 0 ] && [ -f {shlex.quote(result_csv)} ]; then echo DONE; '
            f'else echo "FAILED:$ec"; fi; '
            f"elif tmux has-session -t {shlex.quote(session)} 2>/dev/null; then echo RUNNING; "
            f"else echo GONE; fi"
        )
        async with asyncssh.connect(**build_connect_kwargs(self._vps)) as conn:
            result = await conn.run(probe, timeout=15)
        token = (result.stdout or "").strip()
        return self._map_status(token)

    async def cancel(self, job_id: uuid.UUID) -> None:
        """Kill the job's tmux session. A missing session is not an error."""
        session = session_name(job_id)
        cmd = f"tmux kill-session -t {shlex.quote(session)} 2>/dev/null || true"
        try:
            async with asyncssh.connect(**build_connect_kwargs(self._vps)) as conn:
                await conn.run(cmd, timeout=15)
        except (asyncssh.Error, OSError) as exc:
            raise RuntimeError(
                f"Failed to cancel job on {self._vps.ssh_host}: {exc}"
            ) from exc

    async def has_active_session(self) -> bool:
        """True if any job-* tmux session is alive on the worker (single-run guard)."""
        cmd = "tmux ls 2>/dev/null | grep -c '^job-' || true"
        async with asyncssh.connect(**build_connect_kwargs(self._vps)) as conn:
            result = await conn.run(cmd, timeout=15)
        count = (result.stdout or "0").strip()
        return count.isdigit() and int(count) > 0

    def _build_env_file(
        self, job_id: uuid.UUID, input_file_key: str, config: "JobConfig"
    ) -> str:
        config_json = json.dumps(
            {
                "enable_proxy": config.enable_proxy,
                "skip_duplicates": config.skip_duplicates,
            }
        )
        entries = {
            "JOB_ID": str(job_id),
            "INPUT_FILE_KEY": input_file_key,
            "CONFIG": config_json,
            "DATA_DIR": self._data_dir,
        }
        if config.serper_api_key:
            entries["SERPER_API_KEY"] = config.serper_api_key
        if config.zuhal_api_key:
            entries["ZUHAL_API_KEY"] = config.zuhal_api_key
        # Single-quote every value: CONFIG is JSON with spaces, and secrets may
        # contain shell metacharacters — both break `set -a; . job.env` unquoted.
        return "\n".join(f"{k}={shlex.quote(v)}" for k, v in entries.items())

    @staticmethod
    def _map_status(token: str) -> tuple[str, str | None]:
        if token == "DONE":
            return "COMPLETED", None
        if token == "RUNNING":
            return "RUNNING", None
        if token == "GONE":
            return "FAILED", "worker session ended without writing an exit code"
        if token.startswith("FAILED:"):
            code = token.split(":", 1)[1]
            if code == "0":
                return "FAILED", "pipeline exited 0 but produced no result.csv"
            return "FAILED", f"pipeline exited with code {code}"
        # Unrecognized/empty output (e.g. transient SSH hiccup) — treat as still running.
        return "RUNNING", None
