"""
Hexplain — Job & Report Schemas.

Response models for analysis job listing, detail, and report endpoints.
Never exposes internal file paths.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class JobResponse(BaseModel):
    """Single analysis job detail — includes risk summary when available."""
    id: str
    status: str
    file_name: str
    file_type: str
    file_size: int
    file_hash_sha256: str
    file_hash_sha1: str
    file_hash_md5: str
    created_at: datetime
    updated_at: datetime
    error_message: Optional[str] = None
    stage_status: str = Field(default="{}", description="JSON string of stage completion states")

    # Sprint 2: risk summary from the report (if analysis is complete)
    risk_score: Optional[float] = None
    risk_level: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class JobListResponse(BaseModel):
    """Paginated list of analysis jobs."""
    jobs: List[JobResponse]
    total: int = Field(..., description="Total number of jobs")
    page: int = Field(..., description="Current page number (1-indexed)")
    per_page: int = Field(..., description="Items per page")
    pages: int = Field(..., description="Total number of pages")


class ReportResponse(BaseModel):
    """Full analysis report for a completed job."""
    job_id: str = Field(..., description="UUID of the analysis job")
    risk_score: Optional[float] = Field(None, description="Deterministic risk score (0-100)")
    risk_level: Optional[str] = Field(None, description="Risk level: clean, low, medium, high, critical")
    summary: Optional[str] = Field(None, description="Plain-text summary of analysis findings")
    report_data: Optional[Dict[str, Any]] = Field(None, description="Full structured analysis data")
    created_at: datetime = Field(..., description="Report creation timestamp")
