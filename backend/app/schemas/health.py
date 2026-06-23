"""
Hexplain — Health Check Schema.
"""

from datetime import datetime
from typing import Dict

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Health check response showing status of all subsystems."""
    status: str = Field(..., description="Overall status: healthy | degraded")
    version: str = Field(default="0.1.0", description="API version")
    checks: Dict[str, str] = Field(
        ...,
        description="Per-subsystem status (database, redis, quarantine)",
    )
    timestamp: datetime
