from pydantic import BaseModel, Field, ConfigDict
from typing import Any
from uuid import UUID
from datetime import datetime
from src.models.agent import AgentType, AgentStatus

class AgentBase(BaseModel):
    name: str = Field(..., max_length=255)
    type: AgentType
    config: dict[str, Any] = Field(default_factory=dict)

class AgentCreate(AgentBase):
    pass

class AgentResponse(AgentBase):
    id: UUID
    tenant_id: UUID
    status: AgentStatus
    created_at: datetime
    updated_at: datetime
    created_by: UUID

    model_config = ConfigDict(from_attributes=True)
