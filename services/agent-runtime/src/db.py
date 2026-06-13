"""Database connection management."""

from collections.abc import AsyncGenerator
import logging
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from src.config import settings

logger = logging.getLogger(__name__)

# Fallback to sqlite if postgres is not available or if explicitly using sqlite (e.g. during testing)
database_url = settings.database_url
if "postgresql" in database_url and not database_url.startswith("postgresql+asyncpg"):
    # Ensure correct driver is used
    database_url = database_url.replace("postgresql://", "postgresql+asyncpg://")

# Create engine
# If using sqlite, we might need poolclass=StaticPool or check_same_thread=False
connect_args = {}
if "sqlite" in database_url:
    connect_args["check_same_thread"] = False

engine = create_async_engine(
    database_url,
    connect_args=connect_args,
    echo=False,
)

async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""

    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for getting async database session."""
    async with async_session_maker() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """Initialize database tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
