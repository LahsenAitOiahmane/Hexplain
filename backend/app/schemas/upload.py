"""
Hexplain — Upload Response Schema.

Response model for the file upload endpoint. Never exposes internal
file paths or quarantine locations.
"""

from pydantic import BaseModel, Field


class UploadResponse(BaseModel):
    """Response after successful file upload."""
    job_id: str = Field(..., description="UUID of the created analysis job")
    status: str = Field(..., description="Initial job status (pending)")
    message: str
    duplicate: bool = Field(
        default=False,
        description="True if this file was already uploaded by this user",
    )

    # File metadata (safe to return)
    file_name: str = Field(..., description="Sanitized original filename")
    file_type: str = Field(..., description="Detected file type via magic bytes")
    file_size: int = Field(..., description="File size in bytes")
    file_hash_sha256: str = Field(..., description="SHA-256 hash of the file")
