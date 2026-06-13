"""LangGraph Graph State definition."""

from typing import TypedDict, Annotated, List, Dict, Any, Optional
from langgraph.graph import add_messages


class AgentState(TypedDict):
    # Riwayat percakapan/pesan LLM dan tool outputs
    messages: Annotated[List[Any], add_messages]

    # Metadata context
    agent_id: str
    tenant_id: str
    task: str
    agent_type: str  # Tipe agen untuk menentukan dynamic selection tools

    # State kontrol eksekusi
    status: str  # "planning" | "executing" | "reviewing" | "completed" | "failed"

    # Hasil/output perantara & log
    artifacts: List[Dict[str, Any]]
    execution_log: List[str]

    # Kontrol Retry / Loop Protection
    retry_count: int
    max_retries: int
    current_node: str
    error_message: Optional[str]
