from __future__ import annotations

import os

import pytest
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import create_async_engine

TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://postgres@localhost:5432/scraper_test",
)


@pytest.fixture(scope="module")
async def migrated_engine():
    """Apply all Alembic migrations to the test DB and return an engine."""
    import subprocess

    result = subprocess.run(
        ["alembic", "upgrade", "head"],
        cwd="backend",
        env={**os.environ, "DATABASE_URL": TEST_DB_URL.replace("+asyncpg", "")},
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"alembic upgrade failed:\n{result.stderr}"

    engine = create_async_engine(TEST_DB_URL)
    yield engine
    await engine.dispose()


async def test_migrations_apply_cleanly(migrated_engine) -> None:
    async with migrated_engine.connect() as conn:
        result = await conn.execute(
            text("SELECT version_num FROM alembic_version")
        )
        version = result.scalar_one()
    assert version == "001", f"Expected head revision '001', got '{version}'"


async def test_users_table_exists_with_correct_columns(migrated_engine) -> None:
    async with migrated_engine.connect() as conn:
        result = await conn.execute(
            text("""
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_name = 'users'
                ORDER BY ordinal_position
            """)
        )
        columns = {row[0]: (row[1], row[2]) for row in result}

    assert "id" in columns
    assert "email" in columns
    assert "password_hash" in columns
    assert "created_at" in columns
    assert columns["email"][1] == "NO", "email must be NOT NULL"


async def test_jobs_table_exists_with_correct_columns(migrated_engine) -> None:
    async with migrated_engine.connect() as conn:
        result = await conn.execute(
            text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'jobs'
                ORDER BY ordinal_position
            """)
        )
        columns = {row[0] for row in result}

    required = {
        "id", "user_id", "status", "input_filename", "input_file_key",
        "output_file_key", "config", "kestra_execution_id",
        "created_at", "started_at", "finished_at", "error_message",
    }
    missing = required - columns
    assert not missing, f"Missing columns in jobs table: {missing}"


async def test_jobs_table_has_indexes(migrated_engine) -> None:
    async with migrated_engine.connect() as conn:
        result = await conn.execute(
            text("""
                SELECT indexname FROM pg_indexes
                WHERE tablename = 'jobs'
                  AND indexname NOT LIKE '%_pkey'
            """)
        )
        indexes = {row[0] for row in result}

    assert "ix_jobs_status" in indexes
    assert "ix_jobs_created_at" in indexes
