from __future__ import annotations

from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .database import engine
from .routers import jobs


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Tables are managed by Alembic — never create_all() in production.
    # This lifespan hook is reserved for connection pool warm-up if needed.
    yield
    await engine.dispose()


app = FastAPI(title="us-z backend", lifespan=lifespan, docs_url=None, redoc_url=None)

app.include_router(jobs.router, prefix="/jobs")


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
