
import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from langchain_core.messages import AIMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from src.db import Base, get_db
from src.engine.graph import build_agent_graph
from src.engine.tools.factory import get_tools_for_agent
from src.main import app
from src.models.agent import Agent, AgentExecution, AgentStatus, AgentType

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

TestSessionLocal = async_sessionmaker(
    test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


@pytest_asyncio.fixture(scope="function", autouse=True)
async def setup_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture(scope="function")
async def db_session():
    async with TestSessionLocal() as session:
        yield session


@pytest.fixture(scope="function", autouse=True)
def override_db_dependency(db_session):

    async def _get_test_db():
        yield db_session

    app.dependency_overrides[get_db] = _get_test_db
    with patch("src.routers.agents.async_session_maker", TestSessionLocal):
        yield
    app.dependency_overrides.clear()


@pytest_asyncio.fixture(scope="function")
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_graph_compilation_for_all_agent_types():
    for agent_type in AgentType:
        graph = build_agent_graph(agent_type)
        assert graph is not None
        assert "plan" in graph.nodes
        assert "execute" in graph.nodes
        assert "review" in graph.nodes
        assert "complete" in graph.nodes
        assert "fail" in graph.nodes


@pytest.mark.asyncio
async def test_tool_allowance():
    ci_cd_tools = get_tools_for_agent(AgentType.CI_CD)
    tool_names = [t.name for t in ci_cd_tools]
    assert "git_tool" in tool_names
    assert "docker_tool" in tool_names
    assert "shell_tool" in tool_names

    infra_tools = get_tools_for_agent(AgentType.INFRA)
    tool_names = [t.name for t in infra_tools]
    assert "docker_tool" in tool_names
    assert "shell_tool" in tool_names
    assert "git_tool" not in tool_names

    for atype in [AgentType.INCIDENT, AgentType.MONITORING, AgentType.LOG_ANALYSIS]:
        tools = get_tools_for_agent(atype)
        tool_names = [t.name for t in tools]
        assert "shell_tool" in tool_names
        assert "git_tool" not in tool_names
        assert "docker_tool" not in tool_names


@pytest.mark.asyncio
async def test_graph_execution_flow():
    mock_bound_llm = MagicMock()
    mock_bound_llm.ainvoke = AsyncMock()
    mock_bound_llm.ainvoke.side_effect = [
        AIMessage(
            content="",
            tool_calls=[
                {
                    "name": "shell_tool",
                    "args": {"command": "echo 'test'"},
                    "id": "call_test_1",
                    "type": "tool_call",
                }
            ],
        ),
        AIMessage(content="Final answer from planning"),
    ]

    mock_llm = MagicMock()
    mock_llm.bind_tools.return_value = mock_bound_llm
    mock_llm.ainvoke = AsyncMock(return_value=AIMessage(content="APPROVED"))

    graph = build_agent_graph(AgentType.CI_CD)

    initial_state = {
        "messages": [],
        "agent_id": "test-agent-id",
        "tenant_id": "test-tenant-id",
        "task": "Test mock task",
        "agent_type": "ci_cd",
        "status": "planning",
        "artifacts": [],
        "execution_log": [],
        "retry_count": 0,
        "max_retries": 3,
        "current_node": "start",
        "error_message": None,
    }

    with patch("src.engine.nodes.get_llm", return_value=mock_llm):
        final_state = await graph.ainvoke(initial_state)

    assert final_state["status"] == "completed"
    assert final_state["retry_count"] == 0
    assert any(
        "Node 'plan': LLM generated response." in log
        for log in final_state["execution_log"]
    )
    assert any(
        "Node 'review': Evaluation decision is APPROVED" in log
        for log in final_state["execution_log"]
    )
    assert any(
        "Node 'complete': Task execution marked as completed." in log
        for log in final_state["execution_log"]
    )


@pytest.mark.asyncio
async def test_api_trigger_execution_success(client, db_session):
    tenant_id = uuid.uuid4()
    agent = Agent(
        tenant_id=tenant_id,
        name="CI Agent",
        type=AgentType.CI_CD,
        status=AgentStatus.IDLE,
        config={"max_retries": 2},
    )
    db_session.add(agent)
    await db_session.commit()
    await db_session.refresh(agent)
    agent_id = agent.id

    mock_bound_llm = MagicMock()
    mock_bound_llm.ainvoke = AsyncMock(
        return_value=AIMessage(content="All checks passed!")
    )
    mock_llm = MagicMock()
    mock_llm.bind_tools.return_value = mock_bound_llm
    mock_llm.ainvoke = AsyncMock(return_value=AIMessage(content="APPROVED"))

    headers = {"X-Tenant-ID": str(tenant_id)}
    payload = {
        "task": "Build the staging artifact",
        "config": {"max_retries": 2},
    }

    with patch("src.engine.nodes.get_llm", return_value=mock_llm):
        response = await client.post(
            f"/api/v1/agents/{agent_id}/execute", json=payload, headers=headers
        )
        assert response.status_code == 200
        res_data = response.json()
        assert "execution_id" in res_data
        assert res_data["agent_id"] == str(agent_id)
        assert res_data["status"] == "running"
        assert res_data["task"] == "Build the staging artifact"

        execution_id = uuid.UUID(res_data["execution_id"])

        for _ in range(50):
            await asyncio.sleep(0.05)
            db_session.expire_all()
            exec_query = select(AgentExecution).where(AgentExecution.id == execution_id)
            exec_res = await db_session.execute(exec_query)
            db_exec = exec_res.scalar_one_or_none()
            if db_exec and db_exec.status != "running":
                break

        db_session.expire_all()
        exec_query = select(AgentExecution).where(AgentExecution.id == execution_id)
        exec_res = await db_session.execute(exec_query)
        db_exec = exec_res.scalar_one_or_none()

        assert db_exec is not None
        assert db_exec.status == "completed"
        assert len(db_exec.execution_log) > 0
        assert any("Node 'complete'" in log for log in db_exec.execution_log)

        db_session.expire_all()
        agent_query = select(Agent).where(Agent.id == agent_id)
        agent_res = await db_session.execute(agent_query)
        db_agent = agent_res.scalar_one_or_none()
        assert db_agent is not None
        assert db_agent.status == AgentStatus.IDLE
