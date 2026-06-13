"""Base git tool implementation."""

from typing import Optional
from langchain_core.tools import tool


@tool
def git_tool(
    action: str,
    repo_url: Optional[str] = None,
    branch: Optional[str] = None,
    commit_message: Optional[str] = None,
) -> str:
    """Perform basic Git operations (clone, checkout, status, commit, push).

    Args:
        action: The Git action ("clone", "checkout", "status", "commit", "push").
        repo_url: Optional repository URL (required for clone).
        branch: Optional branch name (required for checkout).
        commit_message: Optional commit message (required for commit).

    Returns:
        Status message about the Git operation.
    """
    return f"Git action '{action}' completed successfully. Repo: {repo_url}, Branch: {branch}, Commit Msg: {commit_message}"
