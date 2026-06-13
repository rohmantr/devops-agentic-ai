"""Base shell tool implementation."""

from langchain_core.tools import tool


@tool
def shell_tool(command: str) -> str:
    """Execute a local shell command.

    Args:
        command: The shell command to run.

    Returns:
        A string containing stdout, stderr, and exit_code.
    """
    # A mock/real implementation that executes a command
    # For now, a mock wrapper or simple subprocess run can be used.
    # To keep it secure and simple for testing/default engine logic,
    # let's run it using subprocess but safely, or we can mock/stub it.
    import subprocess

    try:
        result = subprocess.run(
            command, shell=True, capture_output=True, text=True, timeout=30
        )
        return f"stdout: {result.stdout}\nstderr: {result.stderr}\nexit_code: {result.returncode}"
    except Exception as e:
        return f"stdout: \nstderr: {str(e)}\nexit_code: -1"
