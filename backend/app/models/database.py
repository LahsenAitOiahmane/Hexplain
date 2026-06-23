"""
Hexplain — Database Engine and Session Factory.

Uses synchronous SQLAlchemy 2.0 with SQLite for Sprint 1.
Switching to Postgres later is a config change (DATABASE_URL), not a rewrite.

Security:
  - ORM-only queries (parameterized — no raw SQL concatenation)
  - DB file stored in a dedicated data volume, not in quarantine or web root
"""

from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""
    pass


def _build_engine():
    """Create the SQLAlchemy engine from settings."""
    connect_args = {}

    if settings.DATABASE_URL.startswith("sqlite"):
        # SQLite-specific: allow multi-thread access (safe with sessionmaker)
        connect_args["check_same_thread"] = False

        # Ensure the data directory exists
        db_path = settings.DATABASE_URL.replace("sqlite:///", "")
        if db_path.startswith("./"):
            db_path = db_path[2:]
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    return create_engine(
        settings.DATABASE_URL,
        connect_args=connect_args,
        echo=settings.DEBUG,  # SQL logging only in debug mode
        pool_pre_ping=True,   # Verify connections before use
    )


engine = _build_engine()

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


def init_db() -> None:
    """
    Create all tables defined by ORM models.

    Used for Sprint 1 development. Sprint 2+ will use Alembic migrations
    for schema changes to avoid data loss.
    """
    # Import all models so Base.metadata knows about them
    import app.models.user  # noqa: F401
    import app.models.job  # noqa: F401
    import app.models.report  # noqa: F401
    import app.models.chat  # noqa: F401

    Base.metadata.create_all(bind=engine)

    # Perform a fast schema patch to add session_id to existing chat_messages table
    # This avoids full alembic setup for this sprint.
    from sqlalchemy import text
    try:
        with engine.begin() as conn:
            # Check if column exists
            result = conn.execute(text("PRAGMA table_info(chat_messages)")).fetchall()
            column_names = [row[1] for row in result]
            if "session_id" not in column_names:
                conn.execute(text("ALTER TABLE chat_messages ADD COLUMN session_id VARCHAR(36)"))
                print("Added session_id column to chat_messages table successfully.")
    except Exception as e:
        print(f"Error checking/altering chat_messages schema: {e}")
