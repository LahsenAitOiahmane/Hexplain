"""
MalwAIre — Analysis Job Model.

Tracks the lifecycle of a file analysis: upload → pending → processing → completed/failed.
Each job belongs to exactly one user (ownership enforced on every query).

Security:
  - file_path is internal only — never exposed in API responses
  - file_name is sanitized metadata (original name stored for display, never used in paths)
  - expires_at enables automatic cleanup (Sprint 4)
"""

import enum
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _default_expiry() -> datetime:
    """Default file retention: 24 hours from now."""
    return datetime.now(timezone.utc) + timedelta(hours=24)


class JobStatus(str, enum.Enum):
    """Analysis job lifecycle states."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class AnalysisJob(Base):
    __tablename__ = "analysis_jobs"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[JobStatus] = mapped_column(
        Enum(JobStatus),
        default=JobStatus.PENDING,
        nullable=False,
        index=True,
    )
    stage_status: Mapped[str] = mapped_column(
        Text,
        default="{}",
        nullable=False,
        comment="JSON-encoded dict tracking per-stage status",
    )

    # --- File metadata (safe to expose) ---
    file_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Sanitized original filename (display only, never used in paths)",
    )
    file_type: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        comment="Detected type via magic bytes (e.g., 'PE32 executable', 'ELF 64-bit')",
    )
    file_size: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="File size in bytes",
    )

    # --- Hashes (for dedup, threat intel lookups) ---
    file_hash_sha256: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
    )
    file_hash_sha1: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
    )
    file_hash_md5: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
    )

    # --- Internal storage (NEVER exposed in API responses) ---
    file_path: Mapped[str] = mapped_column(
        String(512),
        nullable=False,
        comment="Quarantine path — internal only, not served",
    )

    # --- Job lifecycle ---
    celery_task_id: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        comment="Celery task ID for status correlation",
    )
    error_message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="Error details if status is FAILED",
    )

    # --- Timestamps ---
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        onupdate=_utcnow,
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_default_expiry,
        nullable=False,
        comment="Auto-deletion timestamp (cleanup cron in Sprint 4)",
    )

    # Relationships
    user = relationship("User", back_populates="jobs")
    report = relationship(
        "AnalysisReport",
        back_populates="job",
        uselist=False,  # One-to-one
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<AnalysisJob id={self.id} status={self.status.value}>"
