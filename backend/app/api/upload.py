"""
MalwAIre — File Upload API Route.

Endpoint:
  POST /api/upload — Upload a file for analysis

Security pipeline (every upload):
  1. Authenticate user (JWT cookie or Bearer)
  2. Validate CSRF token (cookie-based auth only)
  3. Enforce file size limit (configurable, default 25 MB)
  4. Validate real file type via magic bytes (NEVER trust extension/MIME)
  5. Compute cryptographic hashes (SHA-256, SHA-1, MD5)
  6. Check for duplicate upload (same user + same SHA-256)
  7. Store in quarantine (UUID name, 0o440 perms, noexec volume)
  8. Create job record in database
  9. Dispatch async Celery task
  10. Return 202 Accepted with job ID

The uploaded file is NEVER:
  - Placed in a web-accessible directory
  - Executed by any platform component
  - Named using any user-supplied input
"""

import structlog
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user, get_db, verify_csrf
from app.models.job import AnalysisJob, JobStatus
from app.models.user import User
from app.schemas.upload import UploadResponse
from app.services.file_service import (
    compute_hashes,
    sanitize_filename,
    store_in_quarantine,
    validate_file_type,
)

logger = structlog.get_logger("malwaire.api.upload")
router = APIRouter(tags=["Upload"])


@router.post(
    "/upload",
    response_model=UploadResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload a file for malware analysis",
    responses={
        202: {"description": "File accepted, analysis job created"},
        200: {"description": "Duplicate file — existing job returned"},
        413: {"description": "File exceeds size limit"},
        415: {"description": "Unsupported file type (not PE/ELF)"},
    },
)
async def upload_file(
    request: Request,
    file: UploadFile = File(
        ...,
        description="PE (.exe, .dll, .sys) or ELF binary file",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _csrf: None = Depends(verify_csrf),
) -> UploadResponse:
    """
    Upload a binary file for analysis.

    The file is validated via magic bytes (not extension), hashed,
    stored in quarantine, and an async analysis job is dispatched.
    """
    # --- Step 1: Read file content ---
    content = await file.read()

    if not content:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Empty file",
        )

    # --- Step 2: Enforce size limit ---
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size ({len(content)} bytes) exceeds the "
                   f"{settings.MAX_UPLOAD_SIZE_MB} MB limit",
        )

    # --- Step 3: Validate file type via magic bytes ---
    is_valid, family, description = validate_file_type(content)
    if not is_valid:
        logger.warning(
            "upload_rejected_bad_type",
            user_id=current_user.id,
            detected=description,
        )
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type. Only PE and ELF binaries are accepted. "
                   f"Detected: {description}",
        )

    # --- Step 4: Compute hashes ---
    hashes = compute_hashes(content)

    # --- Step 5: Check for duplicate (same user + same SHA-256) ---
    existing_job = (
        db.query(AnalysisJob)
        .filter(
            AnalysisJob.user_id == current_user.id,
            AnalysisJob.file_hash_sha256 == hashes["sha256"],
        )
        .first()
    )
    if existing_job:
        logger.info(
            "upload_duplicate",
            user_id=current_user.id,
            job_id=existing_job.id,
            sha256=hashes["sha256"],
        )
        return UploadResponse(
            job_id=existing_job.id,
            status=existing_job.status.value,
            message="File already uploaded — returning existing job",
            duplicate=True,
            file_name=existing_job.file_name,
            file_type=existing_job.file_type,
            file_size=existing_job.file_size,
            file_hash_sha256=existing_job.file_hash_sha256,
        )

    # --- Step 6: Store in quarantine ---
    file_id, file_path = store_in_quarantine(content, settings.QUARANTINE_DIR)

    # --- Step 7: Sanitize original filename (metadata only) ---
    safe_name = sanitize_filename(file.filename)

    # --- Step 8: Create job record ---
    job = AnalysisJob(
        user_id=current_user.id,
        status=JobStatus.PENDING,
        file_name=safe_name,
        file_type=description,
        file_size=len(content),
        file_hash_sha256=hashes["sha256"],
        file_hash_sha1=hashes["sha1"],
        file_hash_md5=hashes["md5"],
        file_path=file_path,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # --- Step 9: Dispatch async Celery task ---
    try:
        from app.workers.tasks import process_file
        task = process_file.delay(job.id)
        job.celery_task_id = task.id
        db.commit()
    except Exception as exc:
        # If Celery dispatch fails, the job stays in PENDING.
        # A retry mechanism or manual trigger can recover it.
        logger.error(
            "celery_dispatch_failed",
            job_id=job.id,
            error=str(exc),
        )

    logger.info(
        "file_uploaded",
        user_id=current_user.id,
        job_id=job.id,
        file_type=family,
        file_size=len(content),
        sha256=hashes["sha256"],
    )

    # --- Step 10: Return 202 Accepted ---
    return UploadResponse(
        job_id=job.id,
        status=JobStatus.PENDING.value,
        message="File accepted for analysis",
        duplicate=False,
        file_name=safe_name,
        file_type=description,
        file_size=len(content),
        file_hash_sha256=hashes["sha256"],
    )
