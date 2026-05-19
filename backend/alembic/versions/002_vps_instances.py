"""add vps_instances table

Revision ID: 002
Revises: 001
Create Date: 2026-05-19
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "vps_instances",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("kestra_url", sa.Text, nullable=False),
        sa.Column("kestra_webhook_key", sa.Text, nullable=False),
        sa.Column("is_local", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("ssh_host", sa.Text, nullable=True),
        sa.Column("ssh_user", sa.Text, nullable=False, server_default="root"),
        sa.Column("ssh_port", sa.Integer, nullable=False, server_default="22"),
        sa.Column("ssh_key_path", sa.Text, nullable=True),
        sa.Column("data_dir", sa.Text, nullable=False, server_default="/data"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("vps_instances")
