from typing import TypedDict, Annotated, List, Dict, Any, Optional
from langgraph.graph import add_messages


class AgentState(TypedDict):
    messages: Annotated[List[Any], add_messages]

    agent_id: str
    tenant_id: str
    task: str
    agent_type: str

    status: str

    artifacts: List[Dict[str, Any]]
    execution_log: List[str]

    retry_count: int
    max_retries: int
    current_node: str
    error_message: Optional[str]
