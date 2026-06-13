"""Comprehensive tests for Agent CRUD API and tenant isolation."""

import uuid
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import StaticPool

from src.main import app
from src.db import Base, get_db

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
    """Create all tables in the test database and drop them when done."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture(scope="function")
async def db_session():
    """Dependency override fixture for SQLAlchemy session."""
    async with TestSessionLocal() as session:
        yield session


@pytest.fixture(scope="function", autouse=True)
def override_db_dependency(db_session):
    """Override get_db with the test session."""

    async def _get_test_db():
        yield db_session

    app.dependency_overrides[get_db] = _get_test_db
    yield
    app.dependency_overrides.clear()


@pytest_asyncio.fixture(scope="function")
async def client():
    """Httpx AsyncClient fixture."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_create_agent_success(client):
    tenant_id = str(uuid.uuid4())
    payload = {
        "tenant_id": tenant_id,
        "name": "Test Agent",
        "type": "ci_cd",
        "status": "idle",
        "config": {"key": "value"},
    }
    headers = {"X-Tenant-ID": tenant_id}
    response = await client.post("/api/v1/agents/", json=payload, headers=headers)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Agent"
    assert data["tenant_id"] == tenant_id
    assert data["type"] == "ci_cd"
    assert data["status"] == "idle"
    assert data["config"] == {"key": "value"}
    assert "id" in data
    assert "created_at" in data
    assert "updated_at" in data


@pytest.mark.asyncio
async def test_create_agent_header_missing(client):
    tenant_id = str(uuid.uuid4())
    payload = {
        "tenant_id": tenant_id,
        "name": "Test Agent",
        "type": "ci_cd",
        "status": "idle",
        "config": {},
    }
    response = await client.post("/api/v1/agents/", json=payload)
    assert response.status_code == 400
    assert "X-Tenant-ID header is missing" in response.json()["detail"]


@pytest.mark.asyncio
async def test_create_agent_header_mismatch(client):
    tenant_a = str(uuid.uuid4())
    tenant_b = str(uuid.uuid4())
    payload = {
        "tenant_id": tenant_a,
        "name": "Test Agent",
        "type": "ci_cd",
        "status": "idle",
        "config": {},
    }
    headers = {"X-Tenant-ID": tenant_b}
    response = await client.post("/api/v1/agents/", json=payload, headers=headers)
    assert response.status_code == 400
    assert (
        "tenant_id in request body must match X-Tenant-ID header"
        in response.json()["detail"]
    )


@pytest.mark.asyncio
async def test_create_agent_invalid_type(client):
    tenant_id = str(uuid.uuid4())
    payload = {
        "tenant_id": tenant_id,
        "name": "Test Agent",
        "type": "invalid_type",
        "status": "idle",
        "config": {},
    }
    headers = {"X-Tenant-ID": tenant_id}
    response = await client.post("/api/v1/agents/", json=payload, headers=headers)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_list_agents_tenant_isolation(client):
    tenant_a = str(uuid.uuid4())
    tenant_b = str(uuid.uuid4())

    # Create agent for Tenant A
    agent_a_payload = {
        "tenant_id": tenant_a,
        "name": "Agent A",
        "type": "infra",
        "status": "idle",
        "config": {},
    }
    resp = await client.post(
        "/api/v1/agents/", json=agent_a_payload, headers={"X-Tenant-ID": tenant_a}
    )
    assert resp.status_code == 201

    # Create agent for Tenant B
    agent_b_payload = {
        "tenant_id": tenant_b,
        "name": "Agent B",
        "type": "incident",
        "status": "running",
        "config": {},
    }
    resp = await client.post(
        "/api/v1/agents/", json=agent_b_payload, headers={"X-Tenant-ID": tenant_b}
    )
    assert resp.status_code == 201

    # List as Tenant A
    response_a = await client.get("/api/v1/agents/", headers={"X-Tenant-ID": tenant_a})
    assert response_a.status_code == 200
    data_a = response_a.json()
    assert data_a["total"] == 1
    assert len(data_a["items"]) == 1
    assert data_a["items"][0]["name"] == "Agent A"

    # List as Tenant B
    response_b = await client.get("/api/v1/agents/", headers={"X-Tenant-ID": tenant_b})
    assert response_b.status_code == 200
    data_b = response_b.json()
    assert data_b["total"] == 1
    assert len(data_b["items"]) == 1
    assert data_b["items"][0]["name"] == "Agent B"


@pytest.mark.asyncio
async def test_get_agent_by_id_and_isolation(client):
    tenant_a = str(uuid.uuid4())
    tenant_b = str(uuid.uuid4())

    # Create agent for Tenant A
    agent_payload = {
        "tenant_id": tenant_a,
        "name": "Agent A",
        "type": "infra",
        "status": "idle",
        "config": {},
    }
    resp = await client.post(
        "/api/v1/agents/", json=agent_payload, headers={"X-Tenant-ID": tenant_a}
    )
    agent_id = resp.json()["id"]

    # Retrieve agent as Tenant A (should succeed)
    response_a = await client.get(
        f"/api/v1/agents/{agent_id}", headers={"X-Tenant-ID": tenant_a}
    )
    assert response_a.status_code == 200
    assert response_a.json()["id"] == agent_id

    # Retrieve agent as Tenant B (should return 404 for isolation)
    response_b = await client.get(
        f"/api/v1/agents/{agent_id}", headers={"X-Tenant-ID": tenant_b}
    )
    assert response_b.status_code == 404


@pytest.mark.asyncio
async def test_update_agent_and_isolation(client):
    tenant_a = str(uuid.uuid4())
    tenant_b = str(uuid.uuid4())

    # Create agent for Tenant A
    agent_payload = {
        "tenant_id": tenant_a,
        "name": "Agent A",
        "type": "infra",
        "status": "idle",
        "config": {},
    }
    resp = await client.post(
        "/api/v1/agents/", json=agent_payload, headers={"X-Tenant-ID": tenant_a}
    )
    agent_id = resp.json()["id"]

    # Try updating as Tenant B (should return 404 for isolation)
    update_payload = {"name": "Updated Agent Name", "status": "running"}
    response_b = await client.patch(
        f"/api/v1/agents/{agent_id}",
        json=update_payload,
        headers={"X-Tenant-ID": tenant_b},
    )
    assert response_b.status_code == 404

    # Update as Tenant A (should succeed)
    response_a = await client.patch(
        f"/api/v1/agents/{agent_id}",
        json=update_payload,
        headers={"X-Tenant-ID": tenant_a},
    )
    assert response_a.status_code == 200
    updated_data = response_a.json()
    assert updated_data["name"] == "Updated Agent Name"
    assert updated_data["status"] == "running"


@pytest.mark.asyncio
async def test_delete_agent_and_isolation(client):
    tenant_a = str(uuid.uuid4())
    tenant_b = str(uuid.uuid4())

    # Create agent for Tenant A
    agent_payload = {
        "tenant_id": tenant_a,
        "name": "Agent A",
        "type": "infra",
        "status": "idle",
        "config": {},
    }
    resp = await client.post(
        "/api/v1/agents/", json=agent_payload, headers={"X-Tenant-ID": tenant_a}
    )
    agent_id = resp.json()["id"]

    # Try deleting as Tenant B (should return 404 for isolation)
    response_b = await client.delete(
        f"/api/v1/agents/{agent_id}", headers={"X-Tenant-ID": tenant_b}
    )
    assert response_b.status_code == 404

    # Delete as Tenant A (should succeed)
    response_a = await client.delete(
        f"/api/v1/agents/{agent_id}", headers={"X-Tenant-ID": tenant_a}
    )
    assert response_a.status_code == 204

    # Verify deleted
    response_verify = await client.get(
        f"/api/v1/agents/{agent_id}", headers={"X-Tenant-ID": tenant_a}
    )
    assert response_verify.status_code == 404
