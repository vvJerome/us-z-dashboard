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
from backend.models import User, VpsInstance
from backend.routers.jobs import _get_storage
from backend.services.storage import StorageService

TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://scraper:test@localhost:5433/scraper_test",
)

# Matches the placeholder in routers/jobs.py
PLACEHOLDER_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")

# The worker VPS jobs default to. is_local=True so feature tests skip real
# SFTP push/pull and read output straight from local tmp_path storage.
TEST_VPS_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")

# A second VPS, for tests exercising per-VPS concurrency (two jobs, two boxes).
TEST_VPS_ID_2 = uuid.UUID("00000000-0000-0000-0000-000000000003")


class WorkerController:
    """Drives FakeWorker behavior for a single test."""

    def __init__(self) -> None:
        self.busy = False  # has_active_session()
        self.status: tuple[str, str | None] = ("RUNNING", None)  # get_status()
        self.trigger_error: Exception | None = None
        self.cancelled: list[str] = []

    def reset(self) -> None:
        self.__init__()


_worker_controller = WorkerController()


class FakeWorker:
    """Stand-in for WorkerClient — no real SSH. Reads the shared controller."""

    def __init__(self, vps) -> None:
        self._vps = vps

    async def trigger(self, job_id, input_file_key, config) -> str:
        if _worker_controller.trigger_error is not None:
            raise _worker_controller.trigger_error
        return f"job-{job_id}"

    async def get_status(self, job_id) -> tuple[str, str | None]:
        return _worker_controller.status

    async def cancel(self, job_id) -> None:
        _worker_controller.cancelled.append(str(job_id))

    async def has_active_session(self) -> bool:
        return _worker_controller.busy


@pytest.fixture(autouse=True)
def worker(monkeypatch) -> WorkerController:
    _worker_controller.reset()
    monkeypatch.setattr("backend.services.job_queue.WorkerClient", FakeWorker)
    monkeypatch.setattr("backend.routers.jobs.WorkerClient", FakeWorker)
    return _worker_controller


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

        # Seed the local VPS that jobs will default to
        result = await session.execute(
            select(VpsInstance).where(VpsInstance.id == TEST_VPS_ID)
        )
        if result.scalar_one_or_none() is None:
            session.add(
                VpsInstance(
                    id=TEST_VPS_ID,
                    name="Test Local VPS",
                    is_local=True,
                )
            )
            await session.commit()

        # A second VPS for per-VPS concurrency tests
        result = await session.execute(
            select(VpsInstance).where(VpsInstance.id == TEST_VPS_ID_2)
        )
        if result.scalar_one_or_none() is None:
            session.add(
                VpsInstance(
                    id=TEST_VPS_ID_2,
                    name="Test Local VPS 2",
                    is_local=True,
                    repo_dir="/home/devonly/projects/universal-scraper-v3-2",
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
    from backend.routers.zerobounce import _get_data_dir

    storage = StorageService(tmp_path)

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[_get_storage] = lambda: storage
    app.dependency_overrides[_get_data_dir] = lambda: tmp_path

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
