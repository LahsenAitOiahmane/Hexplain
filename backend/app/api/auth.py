"""
MalwAIre — Authentication API Routes.

Endpoints:
  POST /api/auth/register — Create a new user account
  POST /api/auth/login    — Authenticate and set JWT + CSRF cookies
  POST /api/auth/logout   — Clear auth cookies
  GET  /api/auth/me       — Get current user info

Security:
  - Argon2id password hashing
  - JWT in HttpOnly cookie (not localStorage)
  - CSRF Double Submit Cookie on logout
  - Rate-limited login/register to prevent brute force
  - Generic error messages (no user enumeration)

TODO(security): Implement email verification for account creation
TODO(security): Consider OAuth2 provider integration (GitHub)
TODO(security): Consider MFA to strengthen account authentication
TODO(security): Consider leaked password detection (HaveIBeenPwned API)
"""

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user, get_db, verify_csrf
from app.core.security import (
    create_access_token,
    generate_csrf_token,
    hash_password,
    validate_password_strength,
    verify_password,
)
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    UserResponse,
)

logger = structlog.get_logger("malwaire.api.auth")
router = APIRouter(prefix="/auth", tags=["Authentication"])
limiter = Limiter(key_func=get_remote_address)


@router.post(
    "/register",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
)
@limiter.limit(settings.REGISTER_RATE_LIMIT)
def register(
    request: Request,
    body: RegisterRequest,
    db: Session = Depends(get_db),
) -> MessageResponse:
    """
    Create a new user account.

    Validates:
      - Email format (via Pydantic EmailStr)
      - Username format (alphanumeric + underscore/hyphen)
      - Password strength (NIST SP 800-63B guidelines)
      - Email/username uniqueness
    """
    # Validate password strength
    is_strong, error_msg = validate_password_strength(body.password)
    if not is_strong:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=error_msg,
        )

    # Check uniqueness — use generic message to prevent user enumeration
    existing_email = db.query(User).filter(User.email == body.email).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    existing_username = db.query(User).filter(User.username == body.username).first()
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This username is already taken",
        )

    # Create user with Argon2id-hashed password
    user = User(
        email=body.email,
        username=body.username,
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    db.commit()

    logger.info("user_registered", user_id=user.id, username=user.username)

    return MessageResponse(message="Account created successfully")


@router.post(
    "/login",
    response_model=AuthResponse,
    summary="Authenticate and receive JWT + CSRF cookies",
)
@limiter.limit(settings.LOGIN_RATE_LIMIT)
def login(
    request: Request,
    body: LoginRequest,
    db: Session = Depends(get_db),
):
    """
    Authenticate user and set HttpOnly JWT cookie + CSRF cookie.

    Response also includes the CSRF token in the body for curl/API testing
    convenience. In a browser, the frontend reads it from the cookie.

    Uses generic error message to prevent user enumeration.
    """
    # Lookup user — do NOT reveal whether the email exists
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    # Generate tokens
    access_token = create_access_token(user.id)
    csrf_token = generate_csrf_token()

    # Build response with user info + CSRF token
    user_response = UserResponse.model_validate(user)
    response_data = AuthResponse(
        message="Login successful",
        user=user_response,
        csrf_token=csrf_token,
    )

    response = JSONResponse(
        content=response_data.model_dump(mode="json"),
        status_code=status.HTTP_200_OK,
    )

    # Set HttpOnly JWT cookie — not accessible to JavaScript
    # TODO(security): Use __Host- prefix when deploying with HTTPS
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=settings.SECURE_COOKIES,
        samesite="lax",
        max_age=settings.JWT_EXPIRY_MINUTES * 60,
        path="/",
    )

    # Set CSRF cookie — readable by JavaScript (for X-CSRF-Token header)
    response.set_cookie(
        key="csrf_token",
        value=csrf_token,
        httponly=False,  # Intentional: frontend JS must read this
        secure=settings.SECURE_COOKIES,
        samesite="lax",
        max_age=settings.JWT_EXPIRY_MINUTES * 60,
        path="/",
    )

    logger.info("user_logged_in", user_id=user.id)

    return response


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Log out and clear auth cookies",
)
def logout(
    request: Request,
    current_user: User = Depends(get_current_user),
    _csrf: None = Depends(verify_csrf),
) -> JSONResponse:
    """
    Clear authentication cookies. CSRF-protected.

    Note: With stateless JWT, the token remains valid until expiry.
    Server-side token revocation would require a blocklist (deferred).
    """
    # TODO(security): Implement server-side token revocation blocklist
    # for immediate session invalidation on logout.

    response = JSONResponse(
        content={"message": "Logged out successfully"},
        status_code=status.HTTP_200_OK,
    )
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("csrf_token", path="/")

    logger.info("user_logged_out", user_id=current_user.id)

    return response


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current authenticated user info",
)
def get_me(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    """Return the currently authenticated user's profile."""
    return UserResponse.model_validate(current_user)
