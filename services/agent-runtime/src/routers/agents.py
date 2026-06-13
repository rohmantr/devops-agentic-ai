from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from uuid import UUID
from src.db import get_db
from src.models.agent import Agent
from src.schemas.agent import AgentCreate, AgentResponse

router = APIRouter(prefix="/api/v1/agents", tags=["agents"])

# Mock authentication dependency
async def get_current_user():
    # In real scenarios, this extracts tenant_id from JWT
    return {"tenant_id": UUID("550e8400-e29b-41d4-a716-446655440000"), "user_id": UUID("123e4567-e89b-12d3-a456-426614174000")}

@router.post("/", response_model=AgentResponse)
async def create_agent(
    agent_in: AgentCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    new_agent = Agent(
        **agent_in.model_dump(),
        tenant_id=user["tenant_id"],
        created_by=user["user_id"]
    )
    db.add(new_agent)
    await db.commit()
    await db.refresh(new_agent)
    return new_agent

@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    result = await db.execute(
        select(Agent).where(Agent.id == agent_id, Agent.tenant_id == user["tenant_id"])
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return agent

@router.delete("/{agent_id}")
async def delete_agent(
    agent_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    result = await db.execute(
        select(Agent).where(Agent.id == agent_id, Agent.tenant_id == user["tenant_id"])
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    await db.delete(agent)
    await db.commit()
    return {"detail": "Agent deleted"}
