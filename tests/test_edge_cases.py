from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from api import IncidentPayload, health, process_incident
from scripts.github_issue_agent import field, first_line, parse_bool
from src.agents import TriageAgent
from src.models import Incident
from src.orchestrator import IncidentOrchestrator
from src.tools import ToolRegistry


def incident(**overrides) -> Incident:
    values = dict(
        incident_id="EDGE-1",
        title="API timeouts",
        description="A few API timeouts were observed.",
        service="checkout-api",
        environment="development",
        customer_impact="No customer impact",
        recent_change=False,
    )
    values.update(overrides)
    return Incident(**values)


def test_plural_timeouts_are_counted_once():
    severity, _, evidence = TriageAgent().run(incident())
    assert severity == "P4"
    assert evidence.count("Degradation signal: 'timeout'") == 1
    assert not any("'timeouts'" in item for item in evidence)


def test_operator_rejection_is_fail_closed_and_audited(tmp_path):
    log = tmp_path / "audit.jsonl"
    result = IncidentOrchestrator(log_path=str(log)).process(
        incident(
            title="Checkout unavailable",
            description="Checkout is unavailable for all users",
            environment="production",
            customer_impact="All users cannot checkout",
        ),
        approval_rejected=True,
    )
    assert result.status == "ACTION_BLOCKED"
    assert result.approval_id is None
    assert result.tool_executions[-1].tool == "human approval"
    assert result.tool_executions[-1].status == "BLOCKED"
    assert "blocked" in result.stakeholder_message.lower()
    record = json.loads(log.read_text(encoding="utf-8").splitlines()[-1])
    assert record["result"]["status"] == "ACTION_BLOCKED"


def test_mutation_intent_takes_precedence_over_read_only_words():
    result = ToolRegistry().execute(
        "Collect diagnostics and scale worker",
        incident(environment="production"),
        approved=False,
    )
    assert result.tool == "scale worker"
    assert result.status == "BLOCKED"


def test_github_issue_field_helpers_handle_blank_responses():
    body = """### Service
_No response_

### Environment

### Customer impact
Internal only
"""
    assert field(body, "Service", "generic-service") == ""
    assert first_line(field(body, "Service", "generic-service"), "generic-service") == "generic-service"
    assert first_line(field(body, "Environment", "production"), "production") == "production"
    assert field(body, "Customer impact") == "Internal only"


def test_github_boolean_parser_is_strict_but_friendly():
    for value in ["yes", "TRUE", "1", "Recent change detected"]:
        assert parse_bool(value) is True
    for value in ["no", "false", "0", "maybe"]:
        assert parse_bool(value) is False


def test_api_payload_strips_and_normalizes_lookup_fields():
    payload = IncidentPayload(
        incident_id=" API-1 ",
        title=" Test incident ",
        description=" Something happened ",
        service=" CHECKOUT-API ",
        environment=" PRODUCTION ",
        customer_impact=" Users affected ",
        recent_change=True,
    )
    assert payload.incident_id == "API-1"
    assert payload.service == "checkout-api"
    assert payload.environment == "production"


def test_api_payload_rejects_blank_and_extra_fields():
    with pytest.raises(ValidationError):
        IncidentPayload(
            incident_id="API-2",
            title="   ",
            description="Something happened",
            service="checkout-api",
            environment="production",
            customer_impact="Users affected",
            unexpected="not allowed",
        )


def test_api_rejection_path_returns_blocked_result(tmp_path, monkeypatch):
    from api import orchestrator as api_orchestrator

    monkeypatch.setattr(api_orchestrator, "log_path", tmp_path / "api-audit.jsonl")
    payload = IncidentPayload(
        incident_id="API-3",
        title="Checkout unavailable",
        description="Checkout is unavailable for all users",
        service="checkout-api",
        environment="production",
        customer_impact="All users cannot checkout",
        recent_change=True,
    )
    result = process_incident(payload, approved=False, decision="reject")
    assert result["status"] == "ACTION_BLOCKED"
    assert result["tool_executions"][-1]["tool"] == "human approval"


def test_health_declares_no_paid_api_requirement():
    assert health()["paid_api_required"] is False
