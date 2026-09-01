from __future__ import annotations

import asyncio
import logging
import uuid
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select

from .database import AsyncSessionLocal, engine
from .models import PLACEHOLDER_USER_ID, User, VpsInstance
from .routers import inspections, jobs, metrics, vps, zerobounce
from .services import job_queue, zerobounce_queue
from .settings import get_settings


async def _seed_placeholder_user() -> None:
    """Insert the placeholder user row every Job.user_id currently references.

    No real accounts exist yet (auth is deferred), but Job.user_id has a
    foreign key to users.id, without this row, the very first POST /jobs
    on a fresh database 500s with an IntegrityError.
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == PLACEHOLDER_USER_ID))
        if result.scalar_one_or_none() is not None:
            return
        db.add(
            User(
                id=PLACEHOLDER_USER_ID,
                email="placeholder@local",
                password_hash="unused",
            )
        )
        await db.commit()


async def _seed_worker_vps() -> None:
    """Insert the worker-v3 VPS record on first boot if it does not exist."""
    settings = get_settings()
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(VpsInstance).where(VpsInstance.name == "worker-v3")
        )
        if result.scalar_one_or_none() is not None:
            return
        worker = VpsInstance(
            id=uuid.uuid4(),
            name="worker-v3",
            is_local=False,
            ssh_host=settings.worker_ssh_host,
            ssh_user=settings.worker_ssh_user,
            ssh_port=settings.worker_ssh_port,
            ssh_key_path=settings.worker_ssh_key_path,
            data_dir=settings.worker_data_dir,
            repo_dir=settings.worker_repo_dir,
            is_active=True,
        )
        db.add(worker)
        await db.commit()


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    tasks: list[asyncio.Task] = []
    try:
        await _seed_placeholder_user()
    except Exception:
        logger.exception("_seed_placeholder_user failed at startup (non-fatal)")

    try:
        await _seed_worker_vps()
    except Exception:
        logger.exception("_seed_worker_vps failed at startup (non-fatal)")

    try:
        async with AsyncSessionLocal() as db:
            await zerobounce_queue.reconcile_orphaned(db)
    except Exception:
        logger.exception("reconcile_orphaned failed at startup (non-fatal)")

    # Queue loops must start even if the steps above failed (e.g. transient DB
    # hiccup during the first-boot race), silently skipping them here would
    # wedge job dispatch entirely, with no error surfaced anywhere.
    try:
        if get_settings().queue_loop_enabled:
            tasks.append(asyncio.create_task(job_queue.queue_loop()))
            tasks.append(asyncio.create_task(zerobounce_queue.queue_loop()))
    except Exception:
        logger.exception("Failed to start queue loops at startup")
    yield
    for task in tasks:
        task.cancel()
    for task in tasks:
        try:
            await task
        except asyncio.CancelledError:
            pass
    await engine.dispose()


app = FastAPI(title="us-z backend", lifespan=lifespan)

app.include_router(jobs.router, prefix="/jobs")
app.include_router(metrics.router, prefix="/jobs")
app.include_router(vps.router, prefix="/vps")
app.include_router(inspections.router, prefix="/inspections")
app.include_router(zerobounce.router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
