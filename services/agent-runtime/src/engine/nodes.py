
import os
from typing import Dict, Any
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from src.engine.state import AgentState
from src.engine.tools.factory import get_tools_for_agent
from src.models.agent import AgentType


def get_llm():
    api_key = os.environ.get("OPENAI_API_KEY", "mock-key")
    return ChatOpenAI(model="gpt-4o", temperature=0, api_key=api_key)


async def plan_node(state: AgentState) -> Dict[str, Any]:
    agent_type_str = state.get("agent_type", "ci_cd")
    if isinstance(agent_type_str, str):
        agent_type = AgentType(agent_type_str)
    else:
        agent_type = agent_type_str

    tools = get_tools_for_agent(agent_type)
    llm = get_llm().bind_tools(tools)

    system_prompt = (
        f"You are a DevOps Agent of type {agent_type.value}. Your task is: {state['task']}. "
        "Formulate a plan, run tools, or provide the final answer if complete."
    )

    messages = [SystemMessage(content=system_prompt)] + state["messages"]

    response = await llm.ainvoke(messages)

    return {
        "messages": [response],
        "current_node": "plan",
        "execution_log": state.get("execution_log", [])
        + ["Node 'plan': LLM generated response."],
    }


async def review_node(state: AgentState) -> Dict[str, Any]:
    llm = get_llm()

    evaluation_prompt = (
        f"Analyze the task: '{state['task']}' and the execution history.\n"
        "Determine if the task is successfully completed. Answer only APPROVED or RETRY."
    )

    messages = state["messages"] + [HumanMessage(content=evaluation_prompt)]
    response = await llm.ainvoke(messages)

    content = response.content
    if isinstance(content, list):
        text_content = ""
        for block in content:
            if isinstance(block, dict) and "text" in block:
                text_content += block["text"]
            elif isinstance(block, str):
                text_content += block
        decision = text_content.strip().upper()
    else:
        decision = str(content).strip().upper()

    if "APPROVED" in decision:
        decision = "APPROVED"
    elif "RETRY" in decision:
        decision = "RETRY"
    else:
        decision = "RETRY"

    status = "reviewing"
    new_logs = state.get("execution_log", []) + [
        f"Node 'review': Evaluation decision is {decision}"
    ]

    retry_count = state.get("retry_count", 0)
    if decision == "RETRY":
        retry_count += 1

    return {
        "status": status,
        "execution_log": new_logs,
        "current_node": "review",
        "retry_count": retry_count,
    }


async def complete_node(state: AgentState) -> Dict[str, Any]:
    return {
        "status": "completed",
        "current_node": "complete",
        "execution_log": state.get("execution_log", [])
        + ["Node 'complete': Task execution marked as completed."],
    }


async def fail_node(state: AgentState) -> Dict[str, Any]:
    return {
        "status": "failed",
        "current_node": "fail",
        "execution_log": state.get("execution_log", [])
        + ["Node 'fail': Task execution marked as failed."],
    }
