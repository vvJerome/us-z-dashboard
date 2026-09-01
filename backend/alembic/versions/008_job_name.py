"""add optional name column to jobs

Revision ID: 008
Revises: 007
Create Date: 2026-08-26
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("jobs", sa.Column("name", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("jobs", "name")
