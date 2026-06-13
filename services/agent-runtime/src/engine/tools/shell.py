from langchain_core.tools import StructuredTool
from src.engine.sandbox import SandboxManager


def create_shell_tool(agent_type: str) -> StructuredTool:
    def shell_func(command: str) -> str:
        manager = SandboxManager()
        res = manager.run_in_sandbox_sync(agent_type, command)
        return f"stdout: {res['output']}\nstderr: \nexit_code: {res['exit_code']}"

    async def shell_coro(command: str) -> str:
        manager = SandboxManager()
        res = await manager.run_in_sandbox(agent_type, command)
        return f"stdout: {res['output']}\nstderr: \nexit_code: {res['exit_code']}"

    return StructuredTool.from_function(
        func=shell_func,
        coroutine=shell_coro,
        name="shell_tool",
        description="Execute shell commands on the system.",
    )


shell_tool = create_shell_tool("monitoring")
