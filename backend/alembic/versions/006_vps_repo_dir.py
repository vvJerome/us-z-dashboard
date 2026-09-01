"""add vps_instances.repo_dir

Each VpsInstance now carries its own universal-scraper-v3 checkout path
instead of every worker sharing Settings.worker_repo_dir, required so a
second worker VPS with a different repo path can be registered.

Revision ID: 006
Revises: 005
Create Date: 2026-08-11
"""

from alembic import op
import sqlalchemy as sa

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "vps_instances",
        sa.Column(
            "repo_dir",
            sa.Text(),
            nullable=False,
            server_default="/home/devonly/projects/universal-scraper-v3",
        ),
    )


def downgrade() -> None:
    op.drop_column("vps_instances", "repo_dir")
