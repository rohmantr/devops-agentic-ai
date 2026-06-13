from datetime import datetime
import uuid
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field, ConfigDict

from src.models.agent import AgentType, AgentStatus


class AgentBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., max_length=255, pattern=r"^[a-zA-Z0-9_\-\s]+$")
    type: AgentType
    status: AgentStatus = AgentStatus.IDLE
    config: Dict[str, Any] = Field(default_factory=dict)


class AgentCreate(AgentBase):
    tenant_id: uuid.UUID


class AgentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(None, max_length=255, pattern=r"^[a-zA-Z0-9_\-\s]+$")
    type: Optional[AgentType] = None
    status: Optional[AgentStatus] = None
    config: Optional[Dict[str, Any]] = None


class AgentResponse(AgentBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class AgentListResponse(BaseModel):
    items: list[AgentResponse]
    total: int
    skip: int
    limit: int


class ErrorDetail(BaseModel):
    loc: list[str | int]
    msg: str
    type: str


class HTTPError(BaseModel):
    detail: str | list[ErrorDetail]


class AgentExecuteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    task: str = Field(..., max_length=1000)
    config: Optional[Dict[str, Any]] = Field(default_factory=dict)


class AgentExecuteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    execution_id: uuid.UUID
    agent_id: uuid.UUID
    status: str
    task: str
    created_at: datetime
