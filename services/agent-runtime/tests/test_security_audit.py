import uuid
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import StaticPool
from sqlalchemy import text

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
    assert response.status_code == 422 # Expect validation error due to regex

@pytest.mark.asyncio
async def test_auth_bypass_missing_jwt(client):
    # 3. Auth Bypass Test (missing header / mimicking missing JWT)
    payload = {
        "tenant_id": str(uuid.uuid4()),
        "name": "Test Agent",
        "type": "infra"
    }
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
        "extra_injected_field": "hacked"
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
        "config": {}
    }
    await client.post("/api/v1/agents/", json=valid_payload, headers={"X-Tenant-ID": tenant_id})
    
    # Try an injection in a UUID field (like Agent ID)
    injection_id = f"{uuid.uuid4()} OR 1=1--"
    response = await client.get(f"/api/v1/agents/{injection_id}", headers={"X-Tenant-ID": tenant_id})
    
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
    response = await client.get("/api/v1/agents/?skip=0&limit=999999999", headers={"X-Tenant-ID": tenant_id})
    # Should get validation error since limit <= 100
    assert response.status_code == 422
