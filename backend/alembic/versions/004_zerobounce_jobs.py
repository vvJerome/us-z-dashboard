"""add zerobounce_jobs table

Revision ID: 004
Revises: 003
Create Date: 2026-06-02
"""

from alembic import op
import sqlalchemy as sa

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "zerobounce_jobs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="QUEUED"),
        sa.Column("input_filename", sa.String(255), nullable=False),
        sa.Column("filter_mode", sa.String(20), nullable=False),
        sa.Column("email_col", sa.String(100), nullable=False, server_default="email"),
        sa.Column("email_count", sa.Integer(), nullable=True),
        sa.Column("processed_count", sa.Integer(), nullable=True),
        sa.Column("output_file_key", sa.String(500), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("zerobounce_jobs")
