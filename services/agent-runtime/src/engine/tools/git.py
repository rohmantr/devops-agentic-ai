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


def create_git_tool(agent_type: str) -> StructuredTool:
    def git_func(
        action: str,
        repo_url: Optional[str] = None,
        branch: Optional[str] = None,
        commit_message: Optional[str] = None,
    ) -> str:
        validate_input(action)
        validate_input(repo_url)
        validate_input(branch)
        validate_input(commit_message, allow_space=True)
        manager = SandboxManager()
        cmd = f"git {action}"
        if repo_url:
            cmd += f" {repo_url}"
        if branch:
            cmd += f" {branch}"
        if commit_message:
            cmd += f" {commit_message}"
        res = manager.run_in_sandbox_sync(agent_type, cmd)
        if res["exit_code"] == 0:
            return f"Git action '{action}' completed successfully. Repo: {repo_url}, Branch: {branch}, Commit Msg: {commit_message}"
        else:
            return f"Git action '{action}' failed. Error: {res['output']}"

    async def git_coro(
        action: str,
        repo_url: Optional[str] = None,
        branch: Optional[str] = None,
        commit_message: Optional[str] = None,
    ) -> str:
        validate_input(action)
        validate_input(repo_url)
        validate_input(branch)
        validate_input(commit_message, allow_space=True)
        manager = SandboxManager()
        cmd = f"git {action}"
        if repo_url:
            cmd += f" {repo_url}"
        if branch:
            cmd += f" {branch}"
        if commit_message:
            cmd += f" {commit_message}"
        res = await manager.run_in_sandbox(agent_type, cmd)
        if res["exit_code"] == 0:
            return f"Git action '{action}' completed successfully. Repo: {repo_url}, Branch: {branch}, Commit Msg: {commit_message}"
        else:
            return f"Git action '{action}' failed. Error: {res['output']}"

    return StructuredTool.from_function(
        func=git_func,
        coroutine=git_coro,
        name="git_tool",
        description="Execute Git actions such as clone, commit, checkout, push.",
    )


git_tool = create_git_tool("ci_cd")
