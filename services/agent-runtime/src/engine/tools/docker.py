
from typing import Optional
from langchain_core.tools import tool


@tool(description="Execute Docker container actions like run, stop, build.")
def docker_tool(
    action: str, image: str, cmd: Optional[str] = None, env: Optional[dict] = None
) -> str:
    # Simply return a mock/simulated string response for now.
    # We will build full container isolation or mock it in tests.
    return f"Docker action '{action}' on image '{image}' completed successfully. CMD: {cmd}, ENV: {env}"
