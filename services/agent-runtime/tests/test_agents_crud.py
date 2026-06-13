import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from src.main import app
from src.db import get_db
from src.models.agent import Base

DATABASE_URL = "sqlite+aiosqlite:///:memory:"

engine = create_async_engine(DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

async def override_get_db():
    async with TestingSessionLocal() as session:
        yield session

app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest.mark.asyncio
async def test_agent_crud():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create
        response = await client.post("/api/v1/agents/", json={
            "name": "Test Agent",
            "type": "ci_cd",
            "config": {"key": "value"}
        })
        assert response.status_code == 200
        agent = response.json()
        agent_id = agent["id"]

        # Read
        response = await client.get(f"/api/v1/agents/{agent_id}")
        assert response.status_code == 200
        assert response.json()["name"] == "Test Agent"

        # Delete
        response = await client.delete(f"/api/v1/agents/{agent_id}")
        assert response.status_code == 200

        # Verify Deleted
        response = await client.get(f"/api/v1/agents/{agent_id}")
        assert response.status_code == 404
