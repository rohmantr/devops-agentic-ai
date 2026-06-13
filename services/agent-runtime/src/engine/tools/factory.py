from typing import List
from langchain_core.tools import BaseTool
from src.engine.tools.shell import create_shell_tool
from src.engine.tools.docker import create_docker_tool
from src.engine.tools.git import create_git_tool
from src.models.agent import AgentType


def get_tools_for_agent(agent_type: AgentType) -> List[BaseTool]:
    agent_type_str = agent_type.value
    if agent_type == AgentType.CI_CD:
        return [
            create_git_tool(agent_type_str),
            create_docker_tool(agent_type_str),
            create_shell_tool(agent_type_str),
        ]
    elif agent_type == AgentType.INFRA:
        return [
            create_docker_tool(agent_type_str),
            create_shell_tool(agent_type_str),
        ]
    elif agent_type in (
        AgentType.INCIDENT,
        AgentType.MONITORING,
        AgentType.LOG_ANALYSIS,
    ):
        return [create_shell_tool(agent_type_str)]
    else:
        raise ValueError(f"Unknown agent type: {agent_type}")
