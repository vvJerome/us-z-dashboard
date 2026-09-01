"""Seed the dev database with the one row every fresh checkout needs: a
local VpsInstance. Without it, the dashboard's "New job" form has no VPS to
select and can't create a job at all. Idempotent - safe to run repeatedly.
"""

from __future__ import annotations

import asyncio

from sqlalchemy import select

from backend.database import AsyncSessionLocal
from backend.models import VpsInstance

LOCAL_VPS_NAME = "local-dev"


async def seed() -> None:
    async with AsyncSessionLocal() as session:
        existing = await session.scalar(
            select(VpsInstance).where(VpsInstance.name == LOCAL_VPS_NAME)
        )
        if existing:
            print(f"'{LOCAL_VPS_NAME}' VPS already exists, skipping.")
            return

        session.add(VpsInstance(name=LOCAL_VPS_NAME, is_local=True))
        await session.commit()
        print(f"Seeded '{LOCAL_VPS_NAME}' VPS.")


if __name__ == "__main__":
    asyncio.run(seed())
