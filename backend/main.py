from __future__ import annotations

import asyncio
import uuid
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select

from .database import AsyncSessionLocal, engine
from .models import VpsInstance
from .routers import inspections, jobs, metrics, vps, zerobounce
from .services import job_queue
from .settings import get_settings


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


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    task: asyncio.Task | None = None
    try:
        await _seed_worker_vps()
        if get_settings().queue_loop_enabled:
            task = asyncio.create_task(job_queue.queue_loop())
    except Exception:
        pass  # non-fatal — DB may not be reachable during tests or first-boot race
    yield
    if task is not None:
        task.cancel()
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
