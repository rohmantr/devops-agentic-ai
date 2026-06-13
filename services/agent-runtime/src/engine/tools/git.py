
from typing import Optional
from langchain_core.tools import tool


@tool(description="Execute Git actions such as clone, commit, checkout, push.")
def git_tool(
    action: str,
    repo_url: Optional[str] = None,
    branch: Optional[str] = None,
    commit_message: Optional[str] = None,
) -> str:
    return f"Git action '{action}' completed successfully. Repo: {repo_url}, Branch: {branch}, Commit Msg: {commit_message}"
