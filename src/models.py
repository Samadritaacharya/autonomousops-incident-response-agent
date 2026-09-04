from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class Incident:
    incident_id: str
    title: str
    description: str
    service: str
    environment: str
    customer_impact: str
    recent_change: bool = False
    source: str = "manual"
    reporter: str = "portfolio-demo"


@dataclass
class AgentStep:
    agent: str
    status: str
    summary: str
    evidence: List[str] = field(default_factory=list)
    duration_ms: int = 0


@dataclass
class ToolExecution:
    tool: str
    status: str
    message: str
    simulated: bool = True


@dataclass
class AgentResult:
    severity: str
    confidence: float
    sla_minutes: int
    runbook: str
    evidence: List[str]
    recommended_actions: List[str]
    requires_approval: bool
    auto_action: str
    stakeholder_message: str
    status: str
    trace_id: str = ""
    root_cause_hypotheses: List[str] = field(default_factory=list)
    tool_executions: List[ToolExecution] = field(default_factory=list)
    agent_trace: List[AgentStep] = field(default_factory=list)
    llm_mode: str = "deterministic-fallback"
    approval_id: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
