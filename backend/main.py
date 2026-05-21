from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select

from .database import AsyncSessionLocal, engine
from .models import VpsInstance
from .routers import jobs, vps
from .settings import get_settings


async def _seed_default_vps() -> None:
    """Insert a local VPS record on first boot if none exist."""
    settings = get_settings()
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(VpsInstance).limit(1))
        if result.scalar_one_or_none() is not None:
            return
        local_vps = VpsInstance(
            id=uuid.uuid4(),
            name="Local (Hetzner)",
            kestra_url=settings.kestra_base_url,
            kestra_webhook_key=settings.kestra_webhook_key,
            is_local=True,
        )
        db.add(local_vps)
        await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    try:
        await _seed_default_vps()
    except Exception:
        pass  # non-fatal — DB may not be reachable during tests or first-boot race
    yield
    await engine.dispose()


app = FastAPI(title="us-z backend", lifespan=lifespan)

app.include_router(jobs.router, prefix="/jobs")
app.include_router(vps.router, prefix="/vps")


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
