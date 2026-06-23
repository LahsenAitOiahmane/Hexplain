"""
Hexplain — FastAPI Dependency Injection.

Provides reusable dependencies for:
  - Database session management
  - JWT-based authentication (cookie + Bearer header)
  - CSRF validation (Double Submit Cookie pattern)

Security:
  - Supports both cookie-based (browser) and Bearer (API/Swagger) auth
  - CSRF check only applied to cookie-based auth (Bearer is inherently CSRF-safe)
  - User ownership validation is the caller's responsibility (not implicit)
"""

import structlog
from fastapi import Depends, HTTPException, Request, status
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_access_token, validate_csrf_token
from app.models.database import SessionLocal
from app.models.user import User

logger = structlog.get_logger("Hexplain.deps")


# ---------------------------------------------------------------------------
# Database Session
# ---------------------------------------------------------------------------

def get_db():
    """
    Yield a database session, guaranteed to close after use.

    FastAPI runs sync generators in a threadpool, so this is safe
    with sync SQLAlchemy even in an async framework.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------

def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    """
    Extract and validate the authenticated user from the request.

    Auth sources (checked in order):
      1. HttpOnly cookie 'access_token' (browser/frontend path)
      2. Authorization: Bearer <token> header (Swagger/API path)

    Sets request.state.auth_via_cookie for CSRF dependency.
    """
    token = None
    auth_via_cookie = False

    # Source 1: HttpOnly cookie
    cookie_token = request.cookies.get("access_token")
    if cookie_token:
        token = cookie_token
        auth_via_cookie = True

    # Source 2: Authorization header (fallback for Swagger UI / programmatic access)
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    # Decode and validate JWT
    try:
        payload = decode_access_token(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    # Fetch user from database
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    # Store auth method for CSRF dependency
    request.state.auth_via_cookie = auth_via_cookie

    return user


# ---------------------------------------------------------------------------
# CSRF Validation
# ---------------------------------------------------------------------------

def verify_csrf(request: Request) -> None:
    """
    Validate CSRF token using Double Submit Cookie pattern.

    Only enforced when authentication is via cookies (browser path).
    Bearer token auth is inherently CSRF-safe because the client must
    explicitly attach the token — it's not auto-sent by the browser.

    Compares the 'csrf_token' cookie against the 'X-CSRF-Token' header
    using constant-time comparison to prevent timing attacks.
    """
    # Only enforce for cookie-based auth
    auth_via_cookie = getattr(request.state, "auth_via_cookie", False)
    if not auth_via_cookie:
        return

    csrf_cookie = request.cookies.get("csrf_token", "")
    csrf_header = request.headers.get("X-CSRF-Token", "")

    if not validate_csrf_token(csrf_cookie, csrf_header):
        logger.warning("csrf_validation_failed", path=request.url.path)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF validation failed",
        )
