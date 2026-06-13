from unittest.mock import MagicMock
import pytest
from src.engine.sandbox import SandboxManager


@pytest.mark.asyncio
async def test_run_in_sandbox_success():
    manager = SandboxManager()
    result = await manager.run_in_sandbox("ci_cd", "echo 'hello from sandbox'")
    assert result["exit_code"] == 0
    assert "hello from sandbox" in result["output"]


@pytest.mark.asyncio
async def test_run_in_sandbox_timeout():
    manager = SandboxManager()
    result = await manager.run_in_sandbox("ci_cd", "sleep 10", timeout=1)
    assert result["exit_code"] == -1
    assert "timed out" in result["output"]


@pytest.mark.asyncio
async def test_resource_constraints():
    mock_client = MagicMock()
    mock_container = MagicMock()
    mock_container.status = "exited"
    mock_container.wait.return_value = {"StatusCode": 0}
    mock_container.logs.return_value = b"resource test output"
    mock_client.containers.run.return_value = mock_container

    manager = SandboxManager()
    manager.use_fallback = False
    manager.client = mock_client

    result = await manager.run_in_sandbox("infra", "echo 'resource'", timeout=5)
    assert result["exit_code"] == 0
    assert "resource test output" in result["output"]

    mock_client.containers.run.assert_called_once_with(
        image="agent-sandbox-infra:latest",
        command="echo 'resource'",
        detach=True,
        mem_limit="512m",
        cpu_period=100000,
        cpu_quota=50000,
        network_mode="none",
        remove=False,
    )
