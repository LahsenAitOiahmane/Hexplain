"""
Hexplain — Health Check API Route.

Endpoint:
  GET /api/health — Verify all subsystems are operational

Checks:
  - Database connectivity (SQLite/Postgres)
  - Redis connectivity (Celery broker)
  - Quarantine directory existence and writability

This endpoint is unauthenticated so monitoring tools can probe it.
It does NOT expose sensitive information (no config values, no paths).
"""

from datetime import datetime, timezone
from pathlib import Path

import structlog
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_db
from app.schemas.health import HealthResponse

logger = structlog.get_logger("Hexplain.api.health")
router = APIRouter(tags=["Health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Check platform health",
)
def health_check(
    db: Session = Depends(get_db),
) -> HealthResponse:
    """
    Verify that all subsystems (database, Redis, quarantine) are operational.

    Returns 'healthy' if all checks pass, 'degraded' if any fail.
    Individual check results are included for debugging.
    """
    checks: dict[str, str] = {}

    # --- Database check ---
    try:
        db.execute(text("SELECT 1"))
        checks["database"] = "healthy"
    except Exception as exc:
        checks["database"] = f"unhealthy: {type(exc).__name__}"
        logger.error("health_db_failed", error=str(exc))

    # --- Redis check ---
    try:
        import redis as redis_lib
        r = redis_lib.Redis.from_url(settings.REDIS_URL, socket_timeout=3)
        r.ping()
        checks["redis"] = "healthy"
        r.close()
    except Exception as exc:
        checks["redis"] = f"unhealthy: {type(exc).__name__}"
        logger.error("health_redis_failed", error=str(exc))

    # --- Quarantine directory check ---
    quarantine_path = Path(settings.QUARANTINE_DIR)
    if quarantine_path.exists() and quarantine_path.is_dir():
        # Check if writable by attempting to create a temp file
        try:
            test_file = quarantine_path / ".health_check"
            test_file.touch()
            test_file.unlink()
            checks["quarantine"] = "healthy"
        except Exception as exc:
            checks["quarantine"] = f"unhealthy: not writable ({type(exc).__name__})"
            logger.error("health_quarantine_failed", error=str(exc))
    else:
        checks["quarantine"] = "unhealthy: directory not found"

    # --- Overall status ---
    all_healthy = all(v == "healthy" for v in checks.values())

    return HealthResponse(
        status="healthy" if all_healthy else "degraded",
        checks=checks,
        timestamp=datetime.now(timezone.utc),
    )
