from src.evaluator import evaluate_dataset
from src.models import Incident
from src.orchestrator import IncidentOrchestrator


def build(**overrides):
    values = dict(
        incident_id="T-1",
        title="Production outage",
        description="Service unavailable for all users after deployment",
        service="checkout-api",
        environment="production",
        customer_impact="All users affected",
        recent_change=True,
    )
    values.update(overrides)
    return Incident(**values)


def test_high_impact_production_incident_requires_approval(tmp_path):
    result = IncidentOrchestrator(log_path=str(tmp_path / "log.jsonl")).process(build())
    assert result.severity == "P1"
    assert result.requires_approval is True
    assert result.status == "WAITING_FOR_APPROVAL"
    assert result.approval_id
    assert any(t.tool == "request human approval" for t in result.tool_executions)


def test_approval_resumes_workflow(tmp_path):
    orch = IncidentOrchestrator(log_path=str(tmp_path / "log.jsonl"))
    result = orch.process(build(), approval_granted=True)
    assert result.status in {"ACTION_EXECUTED", "ACTION_BLOCKED"}
    assert not any(t.status == "PENDING" for t in result.tool_executions)


def test_low_risk_incident_can_execute_safe_action(tmp_path):
    incident = build(
        title="Minor analytics refresh issue",
        description="One scheduled job failed in staging",
        service="analytics",
        environment="staging",
        customer_impact="Internal report is stale",
        recent_change=False,
    )
    result = IncidentOrchestrator(log_path=str(tmp_path / "log.jsonl")).process(incident)
    assert result.severity in {"P3", "P4"}
    assert result.requires_approval is False
    assert result.status == "ACTION_EXECUTED"


def test_checkout_uses_api_runbook(tmp_path):
    incident = build(recent_change=False)
    result = IncidentOrchestrator(log_path=str(tmp_path / "log.jsonl")).process(incident)
    assert result.runbook == "api-latency.md"


def test_database_uses_database_runbook(tmp_path):
    incident = build(
        service="customer-db",
        title="Database connection failures",
        description="Connections are failing for multiple users",
        customer_impact="Multiple users see errors",
        recent_change=False,
    )
    result = IncidentOrchestrator(log_path=str(tmp_path / "log.jsonl")).process(incident)
    assert result.runbook == "database.md"


def test_every_run_has_trace_and_agent_steps(tmp_path):
    result = IncidentOrchestrator(log_path=str(tmp_path / "log.jsonl")).process(build())
    assert result.trace_id.startswith("TRC-")
    names = {s.agent for s in result.agent_trace}
    assert {"TriageAgent", "RunbookAgent", "RootCauseAgent", "ChangeRiskAgent", "ResolutionAgent", "ToolExecutor", "CommunicationsAgent"} <= names


def test_diagnostics_tool_always_runs(tmp_path):
    result = IncidentOrchestrator(log_path=str(tmp_path / "log.jsonl")).process(build())
    assert result.tool_executions[0].tool == "collect diagnostics"
    assert result.tool_executions[0].status == "SUCCEEDED"


def test_fallback_root_cause_is_bounded(tmp_path, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    result = IncidentOrchestrator(log_path=str(tmp_path / "log.jsonl")).process(build())
    assert 1 <= len(result.root_cause_hypotheses) <= 3
    assert result.llm_mode == "deterministic-fallback"


def test_audit_log_is_written(tmp_path):
    log = tmp_path / "audit.jsonl"
    IncidentOrchestrator(log_path=str(log)).process(build())
    text = log.read_text(encoding="utf-8")
    assert "trace_id" in text
    assert "WAITING_FOR_APPROVAL" in text


def test_evaluation_dataset_has_strong_governance_accuracy(tmp_path):
    output, metrics = evaluate_dataset("data/sample_incidents.csv", log_path=str(tmp_path / "eval.jsonl"))
    assert len(output) == 24
    assert metrics["runbook_accuracy"] == 1.0
    assert metrics["approval_gate_accuracy"] == 1.0
    assert metrics["severity_accuracy"] >= 0.875
