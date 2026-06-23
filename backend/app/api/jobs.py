"""
MalwAIre — Job Status & Report API Routes.

Endpoints:
  GET /api/jobs        — List user's analysis jobs (paginated)
  GET /api/jobs/{id}   — Get single job status and metadata
  GET /api/jobs/{id}/report — Get full analysis report

Security:
  - All queries filter by user_id = current_user.id (ownership enforcement)
  - Internal file paths are NEVER exposed in responses
  - Paginated to prevent excessive data exposure
"""

import json
import math

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.models.job import AnalysisJob
from app.models.report import AnalysisReport
from app.models.user import User
from app.schemas.job import JobListResponse, JobResponse, ReportResponse

logger = structlog.get_logger("malwaire.api.jobs")
router = APIRouter(prefix="/jobs", tags=["Jobs"])


def _job_to_response(job: AnalysisJob) -> JobResponse:
    """
    Convert an AnalysisJob ORM object to a JobResponse, including
    risk score/level from the report if available.
    """
    data = {
        "id": job.id,
        "status": job.status.value if hasattr(job.status, "value") else str(job.status),
        "file_name": job.file_name,
        "file_type": job.file_type,
        "file_size": job.file_size,
        "file_hash_sha256": job.file_hash_sha256,
        "file_hash_sha1": job.file_hash_sha1,
        "file_hash_md5": job.file_hash_md5,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
        "error_message": job.error_message,
        "stage_status": job.stage_status or "{}",
        "risk_score": None,
        "risk_level": None,
    }

    # Include risk info from report if available
    if job.report:
        data["risk_score"] = job.report.risk_score
        data["risk_level"] = job.report.risk_level

    return JobResponse(**data)


@router.get(
    "",
    response_model=JobListResponse,
    summary="List your analysis jobs",
)
def list_jobs(
    request: Request,
    page: int = Query(default=1, ge=1, description="Page number (1-indexed)"),
    per_page: int = Query(default=20, ge=1, le=100, description="Items per page"),
    status_filter: str | None = Query(
        default=None,
        alias="status",
        description="Filter by status (pending, processing, completed, failed)",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JobListResponse:
    """
    List the authenticated user's analysis jobs with pagination.

    Ownership is enforced: users can only see their own jobs.
    """
    # Base query — ALWAYS filtered by user ownership
    query = db.query(AnalysisJob).filter(AnalysisJob.user_id == current_user.id)

    # Optional status filter
    if status_filter:
        query = query.filter(AnalysisJob.status == status_filter)

    # Count total
    total = query.count()
    pages = math.ceil(total / per_page) if total > 0 else 1

    # Paginate (most recent first)
    jobs = (
        query.order_by(AnalysisJob.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return JobListResponse(
        jobs=[_job_to_response(job) for job in jobs],
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@router.get(
    "/{job_id}",
    response_model=JobResponse,
    summary="Get analysis job status and details",
)
def get_job(
    job_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JobResponse:
    """
    Get a single analysis job's status and metadata.

    Ownership is enforced: returns 404 if the job doesn't exist OR
    belongs to another user (prevents enumeration).
    """
    # Filter by BOTH job ID and user ownership
    job = (
        db.query(AnalysisJob)
        .filter(
            AnalysisJob.id == job_id,
            AnalysisJob.user_id == current_user.id,
        )
        .first()
    )

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    return _job_to_response(job)


@router.get(
    "/{job_id}/report",
    response_model=ReportResponse,
    summary="Get full analysis report for a completed job",
    responses={
        200: {"description": "Full analysis report"},
        404: {"description": "Job not found or report not yet available"},
    },
)
def get_report(
    job_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ReportResponse:
    """
    Get the full analysis report for a completed job.

    Returns the structured report data including all analysis module
    outputs, risk score with breakdown, and threat intelligence results.

    Ownership is enforced: returns 404 if the job doesn't exist OR
    belongs to another user (prevents enumeration).
    """
    # Filter by BOTH job ID and user ownership
    job = (
        db.query(AnalysisJob)
        .filter(
            AnalysisJob.id == job_id,
            AnalysisJob.user_id == current_user.id,
        )
        .first()
    )

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    # Check if report exists
    report = (
        db.query(AnalysisReport)
        .filter(AnalysisReport.job_id == job_id)
        .first()
    )

    if not report:
        # Job exists but report isn't created yet at all
        job_status = job.status.value if hasattr(job.status, "value") else str(job.status)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report not yet available — job is {job_status}",
        )

    # Parse report_data JSON
    report_data = None
    if report.report_data:
        try:
            report_data = json.loads(report.report_data)
        except (json.JSONDecodeError, TypeError):
            report_data = {"error": "Failed to parse stored report data"}

    return ReportResponse(
        job_id=report.job_id,
        risk_score=report.risk_score,
        risk_level=report.risk_level,
        summary=report.summary,
        report_data=report_data,
        created_at=report.created_at,
    )


@router.get(
    "/{job_id}/functions/{func_name}",
    summary="Get JIT decompilation for a specific .NET class",
)
def get_function_decompilation(
    job_id: str,
    func_name: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Extracts the C# and IL code for a specific .NET class on demand.
    """
    import os
    import subprocess
    from app.core.config import settings

    job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id, AnalysisJob.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    file_path = os.path.join(settings.QUARANTINE_DIR, job.file_hash_sha256)
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Binary file not found in quarantine")

    ilspy_bin = "/usr/local/bin/ilspycmd"
    if not os.path.isfile(ilspy_bin):
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="ilspycmd not found on server")

    import urllib.parse
    decoded_func_name = urllib.parse.unquote(func_name)
    
    # Check if global decompilation was requested
    if decoded_func_name == ".NET Full Decompilation" or decoded_func_name == "global":
        cmd = [ilspy_bin, file_path]
        il_cmd = [ilspy_bin, "--ilcode", file_path]
    else:
        cmd = [ilspy_bin, "-t", decoded_func_name, file_path]
        il_cmd = [ilspy_bin, "-t", decoded_func_name, "--ilcode", file_path]

    max_lines = 1000
    timeout_seconds = 30

    # Get C# Code
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_seconds)
        code = result.stdout if result.returncode == 0 else f"Failed to decompile {decoded_func_name}"
    except Exception as e:
        code = f"Failed to decompile {decoded_func_name}: {e}"
    
    lines = code.split("\n")
    truncated = len(lines) > max_lines
    if truncated:
        lines = lines[:max_lines]
        lines.append(f"// ... truncated (exceeded {max_lines} line limit)")
    formatted_code = "\n".join(lines)

    # Get IL Code
    il_code = []
    try:
        il_result = subprocess.run(il_cmd, capture_output=True, text=True, timeout=timeout_seconds)
        if il_result.returncode == 0 and il_result.stdout:
            il_lines = il_result.stdout.split("\n")
            if len(il_lines) > max_lines:
                il_lines = il_lines[:max_lines]
                il_lines.append(f"// ... IL truncated (exceeded {max_lines} line limit)")
            
            for i, line in enumerate(il_lines):
                if not line.strip():
                    continue
                il_code.append({
                    "address": f"L{i}",
                    "mnemonic": "IL",
                    "operands": line
                })
    except Exception:
        pass

    return {
        "name": decoded_func_name,
        "address": decoded_func_name,
        "decompiled": formatted_code,
        "line_count": len(lines),
        "truncated": truncated,
        "assembly": il_code,
        "pipeline": "dotnet"
    }
