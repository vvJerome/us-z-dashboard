from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    jobs: Mapped[list[Job]] = relationship("Job", back_populates="user")


class VpsInstance(Base):
    __tablename__ = "vps_instances"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    kestra_url: Mapped[str] = mapped_column(Text, nullable=False)
    kestra_webhook_key: Mapped[str] = mapped_column(Text, nullable=False)
    is_local: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ssh_host: Mapped[str | None] = mapped_column(Text, nullable=True)
    ssh_user: Mapped[str] = mapped_column(Text, nullable=False, default="root")
    ssh_port: Mapped[int] = mapped_column(Integer, nullable=False, default=22)
    ssh_key_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_dir: Mapped[str] = mapped_column(Text, nullable=False, default="/data")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    jobs: Mapped[list[Job]] = relationship("Job", back_populates="vps")


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    vps_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vps_instances.id"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="QUEUED")
    input_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    input_file_key: Mapped[str] = mapped_column(Text, nullable=False)
    output_file_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    kestra_execution_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped[User] = relationship("User", back_populates="jobs")
    vps: Mapped[VpsInstance | None] = relationship("VpsInstance", back_populates="jobs")
