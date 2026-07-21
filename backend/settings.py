from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    data_dir: Path = Path("/data")

    # Worker VPS (universal-scraper-v3) — the only execution target.
    worker_ssh_host: str = "95.217.63.54"
    worker_ssh_user: str = "devonly"
    worker_ssh_port: int = 22
    worker_ssh_key_path: str = "/root/.ssh/id_worker_v3"
    worker_data_dir: str = "/home/devonly/data"
    worker_repo_dir: str = "/home/devonly/projects/universal-scraper-v3"
    queue_loop_enabled: bool = True

    # TODO: add auth
    jwt_secret_key: str = "deferred"
    jwt_algorithm: str = "HS256"
    jwt_expiry_hours: int = 8


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
