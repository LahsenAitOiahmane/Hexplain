"""
Hexplain — Authentication Schemas.

Pydantic models for request validation and response serialization
on auth endpoints. Uses strict types to prevent injection.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterRequest(BaseModel):
    """User registration request."""
    email: EmailStr = Field(..., description="Valid email address")
    username: str = Field(
        ...,
        min_length=3,
        max_length=80,
        pattern=r"^[a-zA-Z0-9_-]+$",
        description="Username (alphanumeric, underscores, hyphens)",
    )
    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="Password (min 8 chars, max 128)",
    )


class LoginRequest(BaseModel):
    """User login request."""
    email: EmailStr = Field(..., description="Registered email address")
    password: str = Field(..., description="Account password")


class UserResponse(BaseModel):
    """User information returned in API responses."""
    id: str
    email: str
    username: str
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AuthResponse(BaseModel):
    """Response for successful login."""
    message: str
    user: UserResponse
    csrf_token: str = Field(
        ...,
        description="CSRF token — also set as cookie. Include as X-CSRF-Token header on state-changing requests.",
    )


class MessageResponse(BaseModel):
    """Generic message response."""
    message: str
