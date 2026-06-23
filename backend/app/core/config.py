"""
Hexplain — Application Configuration.

Uses Pydantic BaseSettings for type-safe config with env var loading.
Implements multi-tiered secret key fallback per secure coding guidelines:
  1. Environment variable
  2. Local secret file
  3. Ephemeral random generation + severe warning
"""

import logging
import secrets
from pathlib import Path

from pydantic_settings import BaseSettings

logger = logging.getLogger("Hexplain.config")


def _resolve_secret(env_name: str, file_name: str) -> str:
    """
    Multi-tiered secret resolution.

    Resolution order:
      1. Environment variable (production)
      2. Local file (development convenience)
      3. Ephemeral random generation (auto-dev, but NOT horizontally scalable)

    Per secure coding guidelines: never hardcode secrets or use literal fallbacks.
    """
    import os

    # Tier 1: Environment variable
    value = os.getenv(env_name)
    if value:
        return value

    # Tier 2: Local secret file
    secret_path = Path(file_name)
    if secret_path.exists():
        content = secret_path.read_text().strip()
        if content:
            return content

    # Tier 3: Ephemeral random — logs a severe warning
    logger.warning(
        "SECRET '%s' not found in env or file '%s'. "
        "Generating ephemeral secret. Sessions will NOT survive restarts. "
        "This instance is isolated — horizontal scaling WILL break sessions.",
        env_name,
        file_name,
    )
    return secrets.token_hex(32)


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # --- Project ---
    PROJECT_NAME: str = "Hexplain"
    API_V1_PREFIX: str = "/api"
    DEBUG: bool = False

    # --- Security ---
    JWT_SECRET_KEY: str = ""
    CSRF_SECRET_KEY: str = ""
    SECURE_COOKIES: bool = False  # Set True in production (HTTPS)

    # --- Database ---
    DATABASE_URL: str = "sqlite:///./data/Hexplain.db"

    # --- Redis ---
    REDIS_URL: str = "redis://redis:6379/0"

    # --- File Upload ---
    MAX_UPLOAD_SIZE_MB: int = 25
    QUARANTINE_DIR: str = "/app/quarantine"
    DATA_DIR: str = "/app/data"

    # --- Allowed file types (magic byte families) ---
    ALLOWED_FILE_TYPES: str = "PE,ELF"

    # --- CORS ---
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # --- JWT ---
    JWT_EXPIRY_MINUTES: int = 30
    JWT_ALGORITHM: str = "HS256"  # Hardcoded — never derive from unverified token

    # --- Rate Limiting ---
    LOGIN_RATE_LIMIT: str = "5/minute"
    REGISTER_RATE_LIMIT: str = "3/minute"

    # --- File Retention ---
    FILE_RETENTION_HOURS: int = 24

    # --- Threat Intel (Sprint 2) ---
    VIRUSTOTAL_API_KEY: str = ""
    MALWAREBAZAAR_API_KEY: str = ""
    THREATFOX_API_KEY: str = ""
    OTX_API_KEY: str = ""
    HYBRID_ANALYSIS_API_KEY: str = ""
    MALSHARE_API_KEY: str = ""

    # --- Analysis (Sprint 2) ---
    GHIDRA_INSTALL_DIR: str = "/opt/ghidra"
    GHIDRA_TIMEOUT_SECONDS: int = 120
    GHIDRA_MAX_FUNCTIONS: int = 10
    YARA_RULES_DIR: str = "/app/yara-rules"
    CAPA_RULES_DIR: str = "/app/capa-rules"

    # --- LLM Explanation (Sprint 3) ---
    GROQ_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    GITHUB_TOKEN: str = ""
    OLLAMA_BASE_URL: str = "http://localhost:11434"


    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
    }

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS_ORIGINS comma-separated string into a list."""
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def allowed_file_types_list(self) -> list[str]:
        """Parse ALLOWED_FILE_TYPES comma-separated string into a list."""
        return [t.strip() for t in self.ALLOWED_FILE_TYPES.split(",") if t.strip()]

    def resolve_secrets(self) -> None:
        """Resolve secret keys using multi-tiered fallback. Call once at startup."""
        if not self.JWT_SECRET_KEY:
            self.JWT_SECRET_KEY = _resolve_secret("JWT_SECRET_KEY", "jwt_secret.txt")
        if not self.CSRF_SECRET_KEY:
            self.CSRF_SECRET_KEY = _resolve_secret("CSRF_SECRET_KEY", "csrf_secret.txt")

    @property
    def max_upload_bytes(self) -> int:
        """Maximum upload size in bytes."""
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024


# Singleton settings instance
settings = Settings()
settings.resolve_secrets()
