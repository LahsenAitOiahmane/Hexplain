"""
MalwAIre — Analysis Report Model (Sprint 2 placeholder).

Will store the structured output of the analysis pipeline:
  - Summary text
  - Deterministic risk score
  - Full analysis data (PE/ELF metadata, strings, YARA hits, capa results, etc.)

For Sprint 1, this model exists so the schema is ready and Alembic can
track it from the beginning. No data is written to it yet.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AnalysisReport(Base):
    __tablename__ = "analysis_reports"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    job_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("analysis_jobs.id", ondelete="CASCADE"),
        unique=True,  # One-to-one with AnalysisJob
        nullable=False,
    )

    # --- Analysis results (all nullable — populated by Sprint 2 pipeline) ---
    summary: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="Plain-language summary of analysis findings",
    )
    risk_score: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
        comment="Hybrid risk score (0.0–100.0): deterministic + LLM weighted",
    )
    risk_level: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
        comment="Risk category: clean, low, medium, high, critical",
    )

    # Flexible JSON field for Sprint 2's structured analysis data.
    # Using Text + manual JSON serialization for SQLite compatibility.
    # Will switch to native JSON column with Postgres.
    report_data: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="JSON-serialized full analysis output (PE metadata, strings, YARA, capa, etc.)",
    )

    # --- Timestamps ---
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        nullable=False,
    )

    # Relationships
    job = relationship("AnalysisJob", back_populates="report")

    def __repr__(self) -> str:
        return f"<AnalysisReport id={self.id} risk_score={self.risk_score}>"
