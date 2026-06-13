"""Agent database models."""

import enum
from datetime import datetime, timezone
import uuid
from sqlalchemy import String, Enum, JSON, DateTime, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from src.db import Base


class AgentType(str, enum.Enum):
    CI_CD = "ci_cd"
    INFRA = "infra"
    INCIDENT = "incident"
    MONITORING = "monitoring"
    LOG_ANALYSIS = "log_analysis"


class AgentStatus(str, enum.Enum):
    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"
    FAILED = "failed"


class Agent(Base):
    """Database model for Agent."""

    __tablename__ = "agents"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(
        String(255), nullable=False
    )
    type: Mapped[AgentType] = mapped_column(
        Enum(AgentType), nullable=False
    )
    status: Mapped[AgentStatus] = mapped_column(
        Enum(AgentStatus), default=AgentStatus.IDLE, nullable=False
    )
    config: Mapped[dict] = mapped_column(
        JSON, default=dict, server_default="{}", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
