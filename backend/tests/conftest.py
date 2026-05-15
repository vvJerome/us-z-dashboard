from __future__ import annotations

import os
import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from backend.database import Base, get_db
from backend.main import app
from backend.models import User
from backend.routers.jobs import _get_kestra, _get_storage
from backend.services.kestra import KestraClient
from backend.services.storage import StorageService

TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://scraper:test@localhost:5433/scraper_test",
)

# Matches the placeholder in routers/jobs.py
PLACEHOLDER_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


@pytest_asyncio.fixture(scope="session")
async def engine():
    eng = create_async_engine(TEST_DB_URL, poolclass=NullPool)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def db(engine) -> AsyncSession:
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as session:
        # Ensure placeholder user exists for FK constraints
        from sqlalchemy import select

        result = await session.execute(
            select(User).where(User.id == PLACEHOLDER_USER_ID)
        )
        if result.scalar_one_or_none() is None:
            session.add(
                User(
                    id=PLACEHOLDER_USER_ID,
                    email="test@example.com",
                    password_hash="$2b$12$placeholder",
                )
            )
            await session.commit()
        yield session


@pytest_asyncio.fixture(autouse=True)
async def clean_jobs(db: AsyncSession) -> None:
    from backend.models import Job
    from sqlalchemy import delete

    yield
    await db.execute(delete(Job))
    await db.commit()


@pytest_asyncio.fixture
async def client(db: AsyncSession, tmp_path):
    storage = StorageService(tmp_path)
    kestra = KestraClient("http://kestra-mock:8080", "test-key")

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[_get_kestra] = lambda: kestra
    app.dependency_overrides[_get_storage] = lambda: storage

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c

    app.dependency_overrides.clear()


@pytest.fixture
def sample_jsonl() -> bytes:
    lines = [
        '{"unique_id":"001","business_name":"Acme Corp","agent_name":"John Doe","state":"FL"}',
        '{"unique_id":"002","business_name":"Beta LLC","agent_name":"Jane Smith","state":"TX"}',
    ]
    return "\n".join(lines).encode()
