from sqlalchemy import Column, String, Enum, DateTime, JSON, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.declarative import declarative_base
import uuid
import enum

Base = declarative_base()

class AgentType(enum.Enum):
    ci_cd = "ci_cd"
    infra = "infra"
    incident = "incident"
    monitoring = "monitoring"
    log_analysis = "log_analysis"

class AgentStatus(enum.Enum):
    idle = "idle"
    running = "running"
    paused = "paused"
    failed = "failed"

class Agent(Base):
    __tablename__ = "agents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    created_by = Column(UUID(as_uuid=True), nullable=False)
    name = Column(String(255), nullable=False)
    type = Column(Enum(AgentType), nullable=False)
    status = Column(Enum(AgentStatus), default=AgentStatus.idle, nullable=False)
    config = Column(JSON, nullable=False, default={})
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
