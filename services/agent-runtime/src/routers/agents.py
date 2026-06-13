
import uuid
from typing import Optional
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Header,
    status,
    BackgroundTasks,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from langchain_core.messages import HumanMessage

from src.db import get_db, async_session_maker
from src.models.agent import Agent, AgentExecution, AgentStatus
from src.schemas.agent import (
    AgentCreate,
    AgentResponse,
    AgentUpdate,
    AgentListResponse,
    AgentExecuteRequest,
    AgentExecuteResponse,
)
from src.engine.graph import build_agent_graph

router = APIRouter(prefix="/api/v1/agents", tags=["agents"])


def get_x_tenant_id(x_tenant_id: Optional[str] = Header(None)) -> uuid.UUID:
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
    count_query = (
        select(func.count()).select_from(Agent).where(Agent.tenant_id == tenant_id)
    )
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = select(Agent).where(Agent.tenant_id == tenant_id).offset(skip).limit(limit)
    result = await db.execute(query)
    items = result.scalars().all()

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
    query = select(Agent).where(Agent.id == agent_id)
    result = await db.execute(query)
    db_agent = result.scalar_one_or_none()

    if not db_agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with ID {agent_id} not found",
        )

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
    query = select(Agent).where(Agent.id == agent_id)
    result = await db.execute(query)
    db_agent = result.scalar_one_or_none()

    if not db_agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with ID {agent_id} not found",
        )

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
    query = select(Agent).where(Agent.id == agent_id)
    result = await db.execute(query)
    db_agent = result.scalar_one_or_none()

    if not db_agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with ID {agent_id} not found",
        )

    if db_agent.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with ID {agent_id} not found",
        )

    await db.delete(db_agent)
    await db.commit()
    return None


async def run_agent_execution(
    execution_id: uuid.UUID,
    agent_id: uuid.UUID,
    tenant_id: uuid.UUID,
    task: str,
    agent_type: str,
    max_retries: int,
):
    from src.models.agent import AgentType

    if isinstance(agent_type, str):
        agent_type = AgentType(agent_type)

    graph = build_agent_graph(agent_type)

    initial_state = {
        "messages": [HumanMessage(content=task)],
        "agent_id": str(agent_id),
        "tenant_id": str(tenant_id),
        "task": task,
        "agent_type": agent_type.value,
        "status": "planning",
        "artifacts": [],
        "execution_log": ["Starting execution of LangGraph engine..."],
        "retry_count": 0,
        "max_retries": max_retries,
        "current_node": "start",
        "error_message": None,
    }

    status = "failed"
    execution_log = ["Starting execution of LangGraph engine..."]
    artifacts = []
    error_message = None

    try:
        final_state = await graph.ainvoke(initial_state)
        status = final_state.get("status", "completed")
        execution_log = final_state.get("execution_log", [])
        artifacts = final_state.get("artifacts", [])
        error_message = final_state.get("error_message", None)
    except Exception as e:
        status = "failed"
        error_message = str(e)
        execution_log.append(f"Execution crashed with error: {error_message}")

    async with async_session_maker() as session:
        try:
            execution_query = select(AgentExecution).where(
                AgentExecution.id == execution_id
            )
            execution_result = await session.execute(execution_query)
            db_execution = execution_result.scalar_one_or_none()
            if db_execution:
                db_execution.status = status
                db_execution.execution_log = execution_log
                db_execution.artifacts = artifacts
                db_execution.error_message = error_message
                session.add(db_execution)

            agent_query = select(Agent).where(Agent.id == agent_id)
            agent_result = await session.execute(agent_query)
            db_agent = agent_result.scalar_one_or_none()
            if db_agent:
                if status == "completed":
                    db_agent.status = AgentStatus.IDLE
                else:
                    db_agent.status = AgentStatus.FAILED
                session.add(db_agent)

            await session.commit()
        except Exception as db_err:
            await session.rollback()
            print(f"Error saving execution results to database: {db_err}")


@router.post(
    "/{agent_id}/execute",
    response_model=AgentExecuteResponse,
    status_code=status.HTTP_200_OK,
)
async def execute_agent(
    agent_id: uuid.UUID,
    agent_in: AgentExecuteRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_x_tenant_id),
):
    query = select(Agent).where(Agent.id == agent_id)
    result = await db.execute(query)
    db_agent = result.scalar_one_or_none()

    if not db_agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with ID {agent_id} not found",
        )

    if db_agent.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with ID {agent_id} not found",
        )

    db_agent.status = AgentStatus.RUNNING
    db.add(db_agent)

    db_execution = AgentExecution(
        agent_id=db_agent.id,
        tenant_id=tenant_id,
        task=agent_in.task,
        status="running",
        execution_log=["Agent execution triggered, scheduling background runner..."],
        artifacts=[],
        error_message=None,
    )
    db.add(db_execution)

    await db.commit()
    await db.refresh(db_execution)
    await db.refresh(db_agent)

    max_retries = 3
    if agent_in.config and "max_retries" in agent_in.config:
        try:
            max_retries = int(agent_in.config["max_retries"])
        except (ValueError, TypeError):
            pass

    background_tasks.add_task(
        run_agent_execution,
        db_execution.id,
        db_agent.id,
        tenant_id,
        agent_in.task,
        db_agent.type,
        max_retries,
    )

    return AgentExecuteResponse(
        execution_id=db_execution.id,
        agent_id=db_agent.id,
        status="running",
        task=agent_in.task,
        created_at=db_execution.created_at,
    )
