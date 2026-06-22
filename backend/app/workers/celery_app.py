"""
MalwAIre — Celery Application Instance.

Configured with Redis as both broker and result backend.
Task serialization uses JSON (no pickle — prevents deserialization attacks).

The worker runs the same codebase as the API, just with a different
entrypoint: celery -A app.workers.celery_app:celery_app worker
"""

from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "malwaire",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    # --- Serialization (security: never use pickle) ---
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",

    # --- Timezone ---
    timezone="UTC",
    enable_utc=True,

    # --- Task behavior ---
    task_track_started=True,    # Report STARTED state (for UI progress)
    task_acks_late=True,        # Acknowledge after completion (crash safety)
    worker_prefetch_multiplier=1,  # Don't prefetch — analysis tasks are heavy

    # --- Result expiry ---
    result_expires=3600,  # Clean up results after 1 hour

    # --- Task routing (future: separate queues for light/heavy tasks) ---
    task_default_queue="malwaire",

    # --- Imports ---
    include=["app.workers.tasks"],
)


# =============================================================================
# YARA rule precompilation — compile once at worker startup, not on first job.
#
# Without this, the first analysis job pays the ~6s compilation cost, making
# its scan_time_seconds misleadingly slow (the _elapsed_seconds wrapper around
# analyze_yara includes compilation, but scan_time_seconds only measures the
# actual yara.match() call — so you see 0.29s scan but 6s wrapper).
#
# Celery's `worker_ready` signal fires once per worker process, after the
# worker connects to the broker and before it accepts tasks.
# =============================================================================
from celery.signals import worker_ready  # noqa: E402


@worker_ready.connect
def precompile_yara_rules(sender=None, **kwargs):
    """Eagerly compile YARA rules when the worker process starts."""
    import structlog
    log = structlog.get_logger("malwaire.workers.startup")

    try:
        from app.services.analysis import yara_scanner
        log.info("yara_precompile_start", rules_dir=settings.YARA_RULES_DIR)
        yara_scanner._load_rules(settings.YARA_RULES_DIR)
        log.info("yara_precompile_done", **yara_scanner._rules_load_stats)
    except Exception as exc:
        # Non-fatal: worker still starts; rules compile lazily on first job
        log.warning("yara_precompile_failed", error=str(exc))
