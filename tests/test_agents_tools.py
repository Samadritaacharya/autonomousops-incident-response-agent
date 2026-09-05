from __future__ import annotations

from types import SimpleNamespace

from src.agents import (
    ChangeRiskAgent,
    CommunicationsAgent,
    ResolutionAgent,
    RootCauseAgent,
    RunbookAgent,
    TriageAgent,
)
from src.llm import LLMReasoner
from src.models import Incident
from src.tools import ToolRegistry


def incident(**overrides) -> Incident:
    values = dict(
        incident_id="UNIT-1",
        title="Routine analytics job",
        description="One scheduled refresh needs inspection",
        service="analytics",
        environment="staging",
        customer_impact="Internal dashboard data is stale",
        recent_change=False,
    )
    values.update(overrides)
    return Incident(**values)


def test_triage_covers_all_severity_bands():
    agent = TriageAgent()
    p1 = agent.run(incident(
        title="Production outage",
        description="Service unavailable for all users after deployment",
        environment="production",
        customer_impact="All users cannot checkout",
        recent_change=True,
    ))
    p2 = agent.run(incident(
        title="Checkout degraded",
        description="Latency and timeouts affect multiple users",
        service="checkout-api",
        environment="production",
        customer_impact="Multiple users delayed",
    ))
    p3 = agent.run(incident(
        title="Queue delayed",
        description="Worker processing delayed",
        service="order-processing",
        environment="staging",
        customer_impact="Internal processing delayed",
    ))
    p4 = agent.run(incident(
        title="Routine check",
        description="Scheduled inspection",
        environment="development",
        customer_impact="No customer impact",
    ))
    assert [p1[0], p2[0], p3[0], p4[0]] == ["P1", "P2", "P3", "P4"]
    assert all(0 < result[1] <= 1 for result in [p1, p2, p3, p4])


def test_runbook_agent_prefers_service_affinity_and_extracts_steps(tmp_path):
    (tmp_path / "api-latency.md").write_text(
        "# API\n- Collect diagnostics\n- Scale worker pool if saturation is confirmed\n",
        encoding="utf-8",
    )
    (tmp_path / "generic-incident.md").write_text(
        "# Generic\n- Validate service health\n",
        encoding="utf-8",
    )
    name, steps, score = RunbookAgent(str(tmp_path)).run(
        incident(service="checkout-api", title="Latency", description="API latency")
    )
    assert name == "api-latency.md"
    assert steps == ["Collect diagnostics", "Scale worker pool if saturation is confirmed"]
    assert score > 0.35


def test_runbook_agent_fails_to_safe_generic_shape_when_directory_is_empty(tmp_path):
    name, steps, score = RunbookAgent(str(tmp_path)).run(incident(service="unknown"))
    assert name == "generic-incident.md"
    assert steps == []
    assert score == 0.0


def test_root_cause_agent_uses_bounded_generated_hypotheses():
    class FakeReasoner:
        mode = "fake"

        def root_cause_hypotheses(self, **_kwargs):
            return ["one", "two", "three", "four"]

    result = RootCauseAgent(FakeReasoner()).run(incident(), "generic-incident.md", ["Collect diagnostics"])
    assert result == ["one", "two", "three", "four"]


def test_root_cause_agent_fallback_is_service_aware_and_bounded():
    class EmptyReasoner:
        mode = "fake"

        def root_cause_hypotheses(self, **_kwargs):
            return None

    result = RootCauseAgent(EmptyReasoner()).run(
        incident(service="customer-db", recent_change=True),
        "database.md",
        ["Collect diagnostics"],
    )
    assert 1 <= len(result) <= 3
    assert any("recent deployment" in item.lower() for item in result)
    assert any("database connection" in item.lower() for item in result)


def test_change_risk_agent_covers_high_recent_production_and_low_risk():
    agent = ChangeRiskAgent()
    assert agent.run(incident(), "P2")["requires_approval"] is True
    assert agent.run(incident(environment="production", recent_change=True), "P3")["requires_approval"] is True
    assert agent.run(incident(environment="staging", recent_change=False), "P3")["requires_approval"] is False


def test_resolution_agent_selects_allowlisted_action_or_diagnostics():
    agent = ResolutionAgent()
    proposed, actions = agent.run(
        incident(),
        ["Check metrics", "Scale worker capacity when backlog is increasing"],
        True,
    )
    assert proposed == "Scale worker capacity when backlog is increasing"
    assert len(actions) == 2

    fallback, fallback_actions = agent.run(incident(), [], False)
    assert fallback == "Collect diagnostics"
    assert fallback_actions


def test_communications_agent_describes_waiting_blocked_and_success_states():
    agent = CommunicationsAgent()
    waiting = agent.run(incident(), "P2", "scale worker", True, "WAITING_FOR_APPROVAL")
    blocked = agent.run(incident(), "P2", "scale worker", True, "ACTION_BLOCKED")
    success = agent.run(incident(), "P4", "collect diagnostics", False, "ACTION_EXECUTED")
    assert "Human approval requested" in waiting
    assert "blocked" in blocked.lower()
    assert "Governance checks passed" in success


def test_tool_registry_collects_known_and_unknown_diagnostics():
    registry = ToolRegistry()
    known = registry.collect_diagnostics(incident(service="customer-db"))
    unknown = registry.collect_diagnostics(incident(service="custom-service"))
    assert known.tool == "collect diagnostics"
    assert known.status == "SUCCEEDED"
    assert "connection" in known.message.lower()
    assert unknown.status == "SUCCEEDED"
    assert "signals collected" in unknown.message.lower()


def test_tool_registry_read_only_safe_mutation_and_unknown_branches():
    registry = ToolRegistry()
    read = registry.execute("Collect diagnostics", incident(environment="production"), approved=False)
    blocked = registry.execute("Scale worker", incident(environment="production"), approved=False)
    approved = registry.execute("Scale worker", incident(environment="production"), approved=True)
    non_prod = registry.execute("Retry failed job", incident(environment="staging"), approved=False)
    unknown = registry.execute("Delete production database", incident(environment="production"), approved=True)
    assert read.status == "SUCCEEDED"
    assert blocked.status == "BLOCKED"
    assert approved.status == "SUCCEEDED"
    assert non_prod.status == "SUCCEEDED"
    assert unknown.status == "BLOCKED"


def test_tool_registry_approval_ids_are_unique_and_well_formed():
    registry = ToolRegistry()
    first = registry.request_approval(incident(), "Scale worker")
    second = registry.request_approval(incident(), "Scale worker")
    assert first["approval_id"].startswith("APR-")
    assert len(first["approval_id"]) == 12
    assert first["approval_id"] != second["approval_id"]
    assert "Scale worker" in first["message"]


def test_llm_reasoner_disabled_mode_never_requires_a_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    reasoner = LLMReasoner()
    assert reasoner.enabled is False
    assert reasoner.mode == "deterministic-fallback"
    assert reasoner.root_cause_hypotheses(
        incident_text="test",
        runbook_name="generic-incident.md",
        runbook_steps=["Collect diagnostics"],
    ) is None


def test_llm_reasoner_parses_and_bounds_structured_model_output(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    reasoner = LLMReasoner()
    reasoner.model = "fake-model"
    response = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content='{"hypotheses":[" one ","two","three","four",""]}'))]
    )
    reasoner._client = SimpleNamespace(
        chat=SimpleNamespace(
            completions=SimpleNamespace(create=lambda **_kwargs: response)
        )
    )
    assert reasoner.enabled is True
    assert reasoner.mode == "generative:fake-model"
    assert reasoner.root_cause_hypotheses(
        incident_text="test",
        runbook_name="generic-incident.md",
        runbook_steps=["Collect diagnostics"],
    ) == ["one", "two", "three"]


def test_llm_reasoner_falls_back_on_model_errors(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    reasoner = LLMReasoner()

    def fail(**_kwargs):
        raise RuntimeError("model unavailable")

    reasoner._client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=fail))
    )
    assert reasoner.root_cause_hypotheses(
        incident_text="test",
        runbook_name="generic-incident.md",
        runbook_steps=["Collect diagnostics"],
    ) is None
