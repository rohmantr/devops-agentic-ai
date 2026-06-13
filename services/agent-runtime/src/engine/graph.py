"""LangGraph workflow definition."""

from typing import Any
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode

from src.engine.state import AgentState
from src.engine.nodes import plan_node, review_node, complete_node, fail_node
from src.engine.tools.factory import get_tools_for_agent
from src.models.agent import AgentType


def should_continue(state: AgentState) -> str:
    """Conditional edge from plan node."""
    messages = state.get("messages", [])
    if not messages:
        return "review"
    last_message = messages[-1]
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "execute"
    return "review"


def review_decision(state: AgentState) -> str:
    """Conditional edge from review node."""
    execution_log = state.get("execution_log", [])
    if not execution_log:
        return "fail"

    last_log = execution_log[-1]
    if "APPROVED" in last_log:
        return "approve"

    retry_count = state.get("retry_count", 0)
    max_retries = state.get("max_retries", 3)
    if retry_count <= max_retries:
        return "retry"

    return "fail"


def build_agent_graph(agent_type: AgentType) -> Any:
    """Build compiled LangGraph StateGraph."""
    workflow = StateGraph(AgentState)

    # Register Nodes
    workflow.add_node("plan", plan_node)

    # Initialize ToolNode with allowed tools for this agent type
    tools = get_tools_for_agent(agent_type)
    workflow.add_node("execute", ToolNode(tools))

    workflow.add_node("review", review_node)
    workflow.add_node("complete", complete_node)
    workflow.add_node("fail", fail_node)

    # Set Entry Point
    workflow.set_entry_point("plan")

    # Set Edges
    workflow.add_conditional_edges(
        "plan", should_continue, {"execute": "execute", "review": "review"}
    )

    # Tool output always returns to plan for determining next steps
    workflow.add_edge("execute", "plan")

    workflow.add_conditional_edges(
        "review",
        review_decision,
        {"approve": "complete", "retry": "plan", "fail": "fail"},
    )

    workflow.add_edge("complete", END)
    workflow.add_edge("fail", END)

    return workflow.compile()
