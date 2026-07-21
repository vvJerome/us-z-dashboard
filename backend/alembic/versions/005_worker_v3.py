"""switch execution from Kestra to SSH+tmux worker

Renames jobs.kestra_execution_id -> jobs.worker_session, drops the Kestra
columns from vps_instances, and retires Kestra-era VPS rows (the app reseeds
worker-v3 on boot).

Revision ID: 005
Revises: 004
Create Date: 2026-07-16
"""

from alembic import op
import sqlalchemy as sa

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("jobs", "kestra_execution_id", new_column_name="worker_session")
    op.drop_column("vps_instances", "kestra_url")
    op.drop_column("vps_instances", "kestra_webhook_key")
    op.execute("UPDATE vps_instances SET is_active = false")


def downgrade() -> None:
    op.add_column(
        "vps_instances",
        sa.Column("kestra_webhook_key", sa.Text(), nullable=False, server_default=""),
    )
    op.add_column(
        "vps_instances",
        sa.Column("kestra_url", sa.Text(), nullable=False, server_default=""),
    )
    op.alter_column("jobs", "worker_session", new_column_name="kestra_execution_id")
