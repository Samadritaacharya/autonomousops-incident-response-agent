from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import json
import time
import uuid

from .agents import (
    TriageAgent,
    RunbookAgent,
    RootCauseAgent,
    ChangeRiskAgent,
    ResolutionAgent,
    CommunicationsAgent,
    SEVERITY_SLA,
)
from .llm import LLMReasoner
from .models import AgentResult, AgentStep, Incident, ToolExecution
from .tools import ToolRegistry


class IncidentOrchestrator:
    """Coordinates specialist agents in a governed event-driven workflow."""

    def __init__(
        self,
        runbook_dir: str = "knowledge/runbooks",
        log_path: str = "activity_log.jsonl",
        reasoner: LLMReasoner | None = None,
    ):
        self.triage = TriageAgent()
        self.runbooks = RunbookAgent(runbook_dir)
        self.root_cause = RootCauseAgent(reasoner)
        self.risk = ChangeRiskAgent()
        self.resolution = ResolutionAgent()
        self.comms = CommunicationsAgent()
        self.tools = ToolRegistry()
        self.reasoner = self.root_cause.reasoner
        self.log_path = Path(log_path)

    @staticmethod
    def _timed_step(agent: str, fn):
        start = time.perf_counter()
        value = fn()
        duration = int((time.perf_counter() - start) * 1000)
        return value, duration

    def process(self, incident: Incident, *, approval_granted: bool = False) -> AgentResult:
        trace_id = f"TRC-{uuid.uuid4().hex[:10].upper()}"
        trace: list[AgentStep] = []
        tool_executions: list[ToolExecution] = []

        (severity, confidence, evidence), ms = self._timed_step(
            "TriageAgent", lambda: self.triage.run(incident)
        )
        trace.append(AgentStep("TriageAgent", "SUCCEEDED", f"Classified {severity}", evidence, ms))

        (runbook, steps, retrieval_score), ms = self._timed_step(
            "RunbookAgent", lambda: self.runbooks.run(incident)
        )
        trace.append(
            AgentStep(
                "RunbookAgent",
                "SUCCEEDED",
                f"Selected {runbook} (retrieval score {retrieval_score:.2f})",
                [f"Grounded on {len(steps)} runbook steps"],
                ms,
            )
        )

        hypotheses, ms = self._timed_step(
            "RootCauseAgent", lambda: self.root_cause.run(incident, runbook, steps)
        )
        trace.append(
            AgentStep(
                "RootCauseAgent",
                "SUCCEEDED",
                "Generated bounded root-cause hypotheses",
                hypotheses,
                ms,
            )
        )

        risk, ms = self._timed_step("ChangeRiskAgent", lambda: self.risk.run(incident, severity))
        requires_approval = bool(risk["requires_approval"])
        trace.append(
            AgentStep(
                "ChangeRiskAgent",
                "SUCCEEDED",
                "Approval required" if requires_approval else "Low-risk automation allowed",
                [str(risk["reason"])],
                ms,
            )
        )

        (proposed_action, actions), ms = self._timed_step(
            "ResolutionAgent", lambda: self.resolution.run(incident, steps, requires_approval)
        )
        trace.append(
            AgentStep(
                "ResolutionAgent",
                "SUCCEEDED",
                f"Proposed: {proposed_action}",
                ["Action selected from grounded runbook and allowlist"],
                ms,
            )
        )

        # Read-only diagnostics are always safe and produce observable tool use.
        diagnostics = self.tools.collect_diagnostics(incident)
        tool_executions.append(diagnostics)

        approval_id = None
        action = proposed_action
        if requires_approval and not approval_granted:
            approval = self.tools.request_approval(incident, proposed_action)
            approval_id = approval["approval_id"]
            tool_executions.append(
                ToolExecution("request human approval", "PENDING", approval["message"])
            )
            status = "WAITING_FOR_APPROVAL"
        else:
            execution = self.tools.execute(
                proposed_action,
                incident,
                approved=approval_granted or not requires_approval,
            )
            tool_executions.append(execution)
            status = "ACTION_EXECUTED" if execution.status == "SUCCEEDED" else "ACTION_BLOCKED"

        trace.append(
            AgentStep(
                "ToolExecutor",
                "SUCCEEDED" if status != "ACTION_BLOCKED" else "BLOCKED",
                status,
                [f"{t.tool}: {t.status}" for t in tool_executions],
                0,
            )
        )

        message, ms = self._timed_step(
            "CommunicationsAgent",
            lambda: self.comms.run(incident, severity, action, requires_approval, status),
        )
        trace.append(
            AgentStep(
                "CommunicationsAgent",
                "SUCCEEDED",
                "Generated stakeholder update",
                [],
                ms,
            )
        )

        result = AgentResult(
            severity=severity,
            confidence=confidence,
            sla_minutes=SEVERITY_SLA[severity],
            runbook=runbook,
            evidence=evidence + [str(risk["reason"])],
            recommended_actions=actions,
            requires_approval=requires_approval,
            auto_action=action,
            stakeholder_message=message,
            status=status,
            trace_id=trace_id,
            root_cause_hypotheses=hypotheses,
            tool_executions=tool_executions,
            agent_trace=trace,
            llm_mode=self.reasoner.mode,
            approval_id=approval_id,
        )
        self._log(incident, result)
        return result

    def _log(self, incident: Incident, result: AgentResult) -> None:
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "trace_id": result.trace_id,
            "incident": incident.__dict__,
            "result": result.to_dict(),
        }
        with self.log_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")
