
from typing import List
from langchain_core.tools import BaseTool
from src.engine.tools.shell import shell_tool
from src.engine.tools.docker import docker_tool
from src.engine.tools.git import git_tool
from src.models.agent import AgentType


def get_tools_for_agent(agent_type: AgentType) -> List[BaseTool]:
    if agent_type == AgentType.CI_CD:
        return [git_tool, docker_tool, shell_tool]
    elif agent_type == AgentType.INFRA:
        return [docker_tool, shell_tool]
    elif agent_type in (
        AgentType.INCIDENT,
        AgentType.MONITORING,
        AgentType.LOG_ANALYSIS,
    ):
        return [shell_tool]
    else:
        raise ValueError(f"Unknown agent type: {agent_type}")
