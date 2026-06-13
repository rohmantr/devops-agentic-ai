import uuid
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from src.db import Base, get_db
from src.engine.graph import build_agent_graph
from src.engine.tools.factory import get_tools_for_agent
from src.engine.tools.shell import shell_tool
from src.main import app
from src.models.agent import AgentType

# Test SQLite in-memory database URL
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

# Setup async engine for tests
test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

# Setup async session maker for tests
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
    yield
    app.dependency_overrides.clear()


@pytest_asyncio.fixture(scope="function")
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_xss_sqlmap_name_injection(client):
    tenant_id = str(uuid.uuid4())
    # 2. Input Validation Test - XSS/sqlmap pattern
    payload = {
        "tenant_id": tenant_id,
        "name": "<script>alert(1)</script> ' OR 1=1--",
        "type": "infra",
        "status": "idle",
        "config": {"key": "value"},
    }
    headers = {"X-Tenant-ID": tenant_id}
    response = await client.post("/api/v1/agents/", json=payload, headers=headers)
    assert response.status_code == 422  # Expect validation error due to regex


@pytest.mark.asyncio
async def test_auth_bypass_missing_jwt(client):
    # 3. Auth Bypass Test (missing header / mimicking missing JWT)
    payload = {"tenant_id": str(uuid.uuid4()), "name": "Test Agent", "type": "infra"}
    # Send request without X-Tenant-ID
    response = await client.post("/api/v1/agents/", json=payload)
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_json_config_injection(client):
    # 4. JSON Config Injection Test - Extra field
    tenant_id = str(uuid.uuid4())
    payload = {
        "tenant_id": tenant_id,
        "name": "Test Agent",
        "type": "infra",
        "status": "idle",
        "config": {"key": "value"},
        "extra_injected_field": "hacked",
    }
    headers = {"X-Tenant-ID": tenant_id}
    # Fastapi will reject extra fields with 422 (extra="forbid")
    response = await client.post("/api/v1/agents/", json=payload, headers=headers)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_sql_injection_probe(client, db_session):
    # 5. SQL Injection Probe - ensure ORM parameterized query cannot be bypassed
    tenant_id = str(uuid.uuid4())

    # Let's create one valid agent
    valid_payload = {
        "tenant_id": tenant_id,
        "name": "Valid Agent",
        "type": "infra",
        "status": "idle",
        "config": {},
    }
    await client.post(
        "/api/v1/agents/", json=valid_payload, headers={"X-Tenant-ID": tenant_id}
    )

    # Try an injection in a UUID field (like Agent ID)
    injection_id = f"{uuid.uuid4()} OR 1=1--"
    response = await client.get(
        f"/api/v1/agents/{injection_id}", headers={"X-Tenant-ID": tenant_id}
    )

    # FastAPI path parameter mapping to uuid.UUID should catch this and return 422
    assert response.status_code == 422

    # Verify the database only has the original agent
    result = await db_session.execute(text("SELECT COUNT(*) FROM agents"))
    count = result.scalar()
    assert count == 1


@pytest.mark.asyncio
async def test_rate_limit_pagination_safety(client):
    # 6. Rate Limit and Pagination Safety
    tenant_id = str(uuid.uuid4())
    # Send massive limit
    response = await client.get(
        "/api/v1/agents/?skip=0&limit=999999999", headers={"X-Tenant-ID": tenant_id}
    )
    # Should get validation error since limit <= 100
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_shell_tool_arbitrary_execution():
    # Verify that shell_tool allows arbitrary command chaining (shell=True vulnerability)
    payload_command = "echo 'vulnerable' && whoami"
    result = shell_tool.invoke({"command": payload_command})
    assert "vulnerable" in result
    assert "exit_code: 0" in result


@pytest.mark.asyncio
async def test_least_privilege_tool_isolation_per_agent():
    # Verify strict least-privilege tool isolation at factory level
    monitoring_tools = get_tools_for_agent(AgentType.MONITORING)
    monitoring_tool_names = [t.name for t in monitoring_tools]
    assert "shell_tool" in monitoring_tool_names
    assert "docker_tool" not in monitoring_tool_names
    assert "git_tool" not in monitoring_tool_names

    # Verify that the graph compiled for MONITORING agent indeed only contains the allowed tools
    graph = build_agent_graph(AgentType.MONITORING)
    execute_node = graph.nodes["execute"]
    
    allowed_tools = []
    if hasattr(execute_node, "bound") and hasattr(execute_node.bound, "tools_by_name"):
        allowed_tools = list(execute_node.bound.tools_by_name.keys())
    
    assert "shell_tool" in allowed_tools
    assert "docker_tool" not in allowed_tools
    assert "git_tool" not in allowed_tools


@pytest.mark.asyncio
async def test_asynchronous_execution_tenant_isolation_risk(client):
    # Verify that the asynchronous execution runs on the same host environment,
    # meaning there is a risk of tenant file access (e.g. reading dev.db)
    # since commands are executed via subprocess on the same host without container sandbox isolation.
    tenant_a = uuid.uuid4()
    agent_payload_a = {
        "tenant_id": str(tenant_a),
        "name": "Agent Tenant A",
        "type": "monitoring",
        "status": "idle",
        "config": {}
    }
    resp_a = await client.post("/api/v1/agents/", json=agent_payload_a, headers={"X-Tenant-ID": str(tenant_a)})
    assert resp_a.status_code == 201
    
    sensitive_file = "dev.db"
    command = f"ls {sensitive_file}"
    result = shell_tool.invoke({"command": command})
    assert "dev.db" in result or "No such file or directory" not in result


@pytest.mark.asyncio
async def test_secrets_leakage_logging():
    # Verify if secrets could leak in exception logs or debug printouts.
    import os
    with patch.dict(os.environ, {"SECRET_KEY": "super_secret_value"}):
        result = shell_tool.invoke({"command": "echo $SECRET_KEY"})
        assert "super_secret_value" in result

