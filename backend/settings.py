from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    kestra_base_url: str = "http://kestra:8080"
    kestra_webhook_key: str = "dev-webhook-key"
    data_dir: Path = Path("/data")

    # TODO: add auth
    jwt_secret_key: str = "deferred"
    jwt_algorithm: str = "HS256"
    jwt_expiry_hours: int = 8


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
