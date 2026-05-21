"""add vps_id to jobs table

Revision ID: 003
Revises: 002
Create Date: 2026-05-19
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "jobs",
        sa.Column(
            "vps_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("vps_instances.id"),
            nullable=True,
        ),
    )
    op.create_index("ix_jobs_vps_id", "jobs", ["vps_id"])


def downgrade() -> None:
    op.drop_index("ix_jobs_vps_id", table_name="jobs")
    op.drop_column("jobs", "vps_id")
