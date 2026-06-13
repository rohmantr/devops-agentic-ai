"""Agent CRUD router."""

import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Header, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from src.db import get_db
from src.models.agent import Agent
from src.schemas.agent import AgentCreate, AgentResponse, AgentUpdate, AgentListResponse

router = APIRouter(prefix="/api/v1/agents", tags=["agents"])


def get_x_tenant_id(x_tenant_id: Optional[str] = Header(None)) -> uuid.UUID:
    """Dependency to retrieve and validate the X-Tenant-ID header."""
    if not x_tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Tenant-ID header is missing",
        )
    try:
        return uuid.UUID(x_tenant_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid X-Tenant-ID header format (UUID expected)",
        )


@router.post("/", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def create_agent(
    agent_in: AgentCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_x_tenant_id),
):
    """Create a new agent for the tenant."""
    # Ensure tenant_id from header matches tenant_id in schema
    if agent_in.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="tenant_id in request body must match X-Tenant-ID header",
        )

    db_agent = Agent(
        tenant_id=agent_in.tenant_id,
        name=agent_in.name,
        type=agent_in.type,
        status=agent_in.status,
        config=agent_in.config,
    )
    db.add(db_agent)
    await db.commit()
    await db.refresh(db_agent)
    return db_agent


@router.get("/", response_model=AgentListResponse)
async def list_agents(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_x_tenant_id),
):
    """List agents for the tenant with pagination."""
    # Total count query
    count_query = select(func.count()).select_from(Agent).where(Agent.tenant_id == tenant_id)
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Pagination query
    query = (
        select(Agent)
        .where(Agent.tenant_id == tenant_id)
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(query)
    items = result.scalars().all()

    # Convert to list of AgentResponse to satisfy type check or return directly as items
    return AgentListResponse(
        items=[AgentResponse.model_validate(item) for item in items],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_x_tenant_id),
):
    """Retrieve details of a specific agent with tenant isolation."""
    query = select(Agent).where(Agent.id == agent_id)
    result = await db.execute(query)
    db_agent = result.scalar_one_or_none()

    if not db_agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with ID {agent_id} not found",
        )

    # Tenant isolation validation
    if db_agent.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with ID {agent_id} not found",
        )

    return db_agent


@router.patch("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: uuid.UUID,
    agent_in: AgentUpdate,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_x_tenant_id),
):
    """Update an agent with tenant isolation verification."""
    query = select(Agent).where(Agent.id == agent_id)
    result = await db.execute(query)
    db_agent = result.scalar_one_or_none()

    if not db_agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with ID {agent_id} not found",
        )

    # Tenant isolation validation
    if db_agent.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with ID {agent_id} not found",
        )

    update_data = agent_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_agent, key, value)

    db.add(db_agent)
    await db.commit()
    await db.refresh(db_agent)
    return db_agent


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(
    agent_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_x_tenant_id),
):
    """Delete an agent with tenant isolation verification."""
    query = select(Agent).where(Agent.id == agent_id)
    result = await db.execute(query)
    db_agent = result.scalar_one_or_none()

    if not db_agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with ID {agent_id} not found",
        )

    # Tenant isolation validation
    if db_agent.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with ID {agent_id} not found",
        )

    await db.delete(db_agent)
    await db.commit()
    return None
