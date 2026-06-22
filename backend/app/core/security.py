"""
MalwAIre — Security Utilities.

Handles:
  - Password hashing (Argon2)
  - JWT token creation and validation
  - CSRF token generation

Security rules enforced:
  - JWT algorithm hardcoded to HS256 (never derived from unverified token)
  - 'none' algorithm explicitly rejected
  - 'exp' claim always set and validated
  - Argon2id for password hashing (memory-hard, per NIST recommendations)
"""

import secrets
from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError
from jose import JWTError, jwt

from app.core.config import settings

# ---------------------------------------------------------------------------
# Password Hashing — Argon2id (memory-hard, recommended over bcrypt)
# ---------------------------------------------------------------------------

_ph = PasswordHasher(
    time_cost=3,       # Number of iterations
    memory_cost=65536,  # 64 MB memory usage
    parallelism=4,      # Parallel threads
    hash_len=32,        # Output hash length
    salt_len=16,        # Salt length
)


def hash_password(plain_password: str) -> str:
    """Hash a password using Argon2id. Returns PHC-format hash string."""
    return _ph.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a password against its Argon2id hash.

    Returns False on mismatch — never raises to the caller.
    Does NOT log the password or hash (per secure coding guidelines).
    """
    try:
        return _ph.verify(hashed_password, plain_password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


# ---------------------------------------------------------------------------
# JWT Token Management
# ---------------------------------------------------------------------------

def create_access_token(user_id: str) -> str:
    """
    Create a JWT access token.

    Claims:
      - sub: user ID (subject)
      - exp: expiration timestamp
      - iat: issued-at timestamp
      - type: "access" (for future refresh token distinction)
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.JWT_EXPIRY_MINUTES)

    payload = {
        "sub": user_id,
        "exp": expire,
        "iat": now,
        "type": "access",
    }

    # Algorithm is hardcoded — never derived from an unverified token
    return jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def decode_access_token(token: str) -> dict:
    """
    Decode and validate a JWT access token.

    Raises JWTError on:
      - Invalid signature
      - Expired token
      - 'none' algorithm
      - Algorithm mismatch
      - Missing required claims

    Returns the decoded payload dict on success.
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],  # Explicit allow-list
            options={
                "require_exp": True,
                "require_sub": True,
            },
        )

        # Reject 'none' algorithm tokens (defense-in-depth, python-jose
        # already handles this with the algorithms param, but we verify)
        token_header = jwt.get_unverified_header(token)
        if token_header.get("alg", "").lower() == "none":
            raise JWTError("Algorithm 'none' is not allowed")

        # Verify token type
        if payload.get("type") != "access":
            raise JWTError("Invalid token type")

        return payload

    except JWTError:
        raise


# ---------------------------------------------------------------------------
# CSRF Token — Double Submit Cookie pattern
# ---------------------------------------------------------------------------

def generate_csrf_token() -> str:
    """Generate a cryptographically random CSRF token (64 hex chars)."""
    return secrets.token_hex(32)


def validate_csrf_token(cookie_value: str, header_value: str) -> bool:
    """
    Validate CSRF token using constant-time comparison.

    Compares the value from the csrf_token cookie with the X-CSRF-Token header.
    Uses secrets.compare_digest to prevent timing attacks.
    """
    if not cookie_value or not header_value:
        return False
    return secrets.compare_digest(cookie_value, header_value)


# ---------------------------------------------------------------------------
# Password Strength Validation
# ---------------------------------------------------------------------------

def validate_password_strength(password: str) -> tuple[bool, str]:
    """
    Validate password strength per NIST SP 800-63B guidelines.

    Rules:
      - Minimum 8 characters (12+ recommended)
      - Maximum 128 characters
      - No character composition requirements (per NIST)
      - All character types allowed

    Returns (is_valid, error_message).
    """
    # TODO(security): Consider adding zxcvbn-python for advanced strength
    # estimation (dictionary attacks, common patterns, keyboard walks).
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"
    if len(password) > 128:
        return False, "Password must be at most 128 characters long"
    return True, ""
