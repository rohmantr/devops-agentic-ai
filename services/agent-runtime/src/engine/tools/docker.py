import re
from typing import Optional
from langchain_core.tools import StructuredTool
from src.engine.sandbox import SandboxManager


def validate_input(val: Optional[str], allow_space: bool = False) -> None:
    if val is None:
        return
    pattern = r"^[a-zA-Z0-9\-_/.: ]*$" if allow_space else r"^[a-zA-Z0-9\-_/.:]*$"
    if not re.match(pattern, val):
        raise ValueError("Invalid characters in input parameter")


def create_docker_tool(agent_type: str) -> StructuredTool:
    def docker_func(
        action: str, image: str, cmd: Optional[str] = None, env: Optional[dict] = None
    ) -> str:
        validate_input(action)
        validate_input(image)
        validate_input(cmd, allow_space=True)
        if env:
            for k, v in env.items():
                validate_input(k)
                if isinstance(v, str):
                    validate_input(v, allow_space=True)
        manager = SandboxManager()
        docker_cmd = f"docker {action} {image}"
        if cmd:
            docker_cmd += f" {cmd}"
        res = manager.run_in_sandbox_sync(agent_type, docker_cmd)
        if res["exit_code"] == 0:
            return f"Docker action '{action}' on image '{image}' completed successfully. CMD: {cmd}, ENV: {env}"
        else:
            return f"Docker action '{action}' on image '{image}' failed. Error: {res['output']}"

    async def docker_coro(
        action: str, image: str, cmd: Optional[str] = None, env: Optional[dict] = None
    ) -> str:
        validate_input(action)
        validate_input(image)
        validate_input(cmd, allow_space=True)
        if env:
            for k, v in env.items():
                validate_input(k)
                if isinstance(v, str):
                    validate_input(v, allow_space=True)
        manager = SandboxManager()
        docker_cmd = f"docker {action} {image}"
        if cmd:
            docker_cmd += f" {cmd}"
        res = await manager.run_in_sandbox(agent_type, docker_cmd)
        if res["exit_code"] == 0:
            return f"Docker action '{action}' on image '{image}' completed successfully. CMD: {cmd}, ENV: {env}"
        else:
            return f"Docker action '{action}' on image '{image}' failed. Error: {res['output']}"

    return StructuredTool.from_function(
        func=docker_func,
        coroutine=docker_coro,
        name="docker_tool",
        description="Execute Docker container actions like run, stop, build.",
    )


docker_tool = create_docker_tool("ci_cd")
