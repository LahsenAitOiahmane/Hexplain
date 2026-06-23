"""
Hexplain — FastAPI Application Factory.

Creates and configures the FastAPI application with:
  - Security headers middleware (CSP, X-Frame-Options, etc.)
  - CORS middleware (strict origin allow-list)
  - Request ID middleware for distributed tracing
  - Rate limit error handling
  - Database initialization on startup
  - Router registration for all API modules

Security headers enforced on every response:
  - Content-Security-Policy: strict (no unsafe-inline/eval)
  - X-Content-Type-Options: nosniff
  - X-Frame-Options: DENY
  - Permissions-Policy: disable unused browser features
  - Referrer-Policy: strict-origin-when-cross-origin
  - Cache-Control: no-store (for authenticated responses)
"""

import uuid
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

from app.api import auth, health, jobs, upload
from app.core.config import settings
from app.models.database import init_db

logger = structlog.get_logger("Hexplain.main")


# ---------------------------------------------------------------------------
# Lifespan — startup / shutdown
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown hooks."""
    # Startup
    logger.info("starting_Hexplain", version="0.1.0")
    init_db()
    logger.info("database_initialized")

    # Ensure quarantine directory exists
    from pathlib import Path
    Path(settings.QUARANTINE_DIR).mkdir(parents=True, exist_ok=True)
    Path(settings.DATA_DIR).mkdir(parents=True, exist_ok=True)
    logger.info("directories_ready",
                quarantine=settings.QUARANTINE_DIR,
                data=settings.DATA_DIR)

    yield

    # Shutdown
    logger.info("shutting_down_Hexplain")


# ---------------------------------------------------------------------------
# Security Headers Middleware
# ---------------------------------------------------------------------------

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Add security headers to every response.

    These headers are defense-in-depth against XSS, clickjacking,
    MIME sniffing, and information leakage.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"

        # Content Security Policy — strict, no unsafe-inline/eval
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "  # Swagger UI needs inline styles
            "img-src 'self' data:; "
            "object-src 'none'; "
            "frame-ancestors 'none'; "
            "base-uri 'self'"
        )

        # Disable unused browser features
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), "
            "payment=(), usb=(), magnetometer=()"
        )

        # Referrer policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Prevent caching of authenticated responses
        if request.cookies.get("access_token"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
            response.headers["Pragma"] = "no-cache"

        return response


# ---------------------------------------------------------------------------
# Request ID Middleware
# ---------------------------------------------------------------------------

class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    Assign a unique request ID to every request for distributed tracing.

    The ID is:
      - Generated as a UUID4 (or taken from incoming X-Request-ID header)
      - Added to the response as X-Request-ID header
      - Available via request.state.request_id for logging
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request.state.request_id = request_id

        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id

        return response


# ---------------------------------------------------------------------------
# Application Factory
# ---------------------------------------------------------------------------

def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""

    application = FastAPI(
        title=settings.PROJECT_NAME,
        description=(
            "AI-assisted platform for analyzing executable files (PE/ELF). "
            "Turns opaque binary content into plain-language explanations "
            "with defensible risk scores."
        ),
        version="0.1.0",
        docs_url="/docs",       # Swagger UI
        redoc_url="/redoc",     # ReDoc
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    # --- Rate limit error handler ---
    application.state.limiter = auth.limiter
    application.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # --- Middleware (order matters: outermost first) ---

    # Request ID (outermost — runs first on request, last on response)
    application.add_middleware(RequestIDMiddleware)

    # Security headers
    application.add_middleware(SecurityHeadersMiddleware)

    # CORS — strict origin allow-list, credentials enabled for cookies
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["X-CSRF-Token", "Content-Type", "Authorization", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )

    # --- Routers ---
    application.include_router(auth.router, prefix=settings.API_V1_PREFIX)
    application.include_router(upload.router, prefix=settings.API_V1_PREFIX)
    application.include_router(jobs.router, prefix=settings.API_V1_PREFIX)
    application.include_router(health.router, prefix=settings.API_V1_PREFIX)
    
    from app.api import chat
    application.include_router(chat.router, prefix=settings.API_V1_PREFIX)

    # --- Root endpoint ---
    @application.get("/", include_in_schema=False)
    def root():
        return {
            "name": settings.PROJECT_NAME,
            "version": "0.1.0",
            "docs": "/docs",
            "health": f"{settings.API_V1_PREFIX}/health",
        }

    return application


# Application instance — imported by uvicorn
app = create_app()
