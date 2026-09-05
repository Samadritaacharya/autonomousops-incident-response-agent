from src.agents import RunbookAgent, TriageAgent
from src.models import Incident


def make_incident(**overrides) -> Incident:
    values = {
        "incident_id": "EDGE-1",
        "title": "Routine validation",
        "description": "Monitoring shows healthy service behavior",
        "service": "unknown-service",
        "environment": "staging",
        "customer_impact": "No customer impact",
        "recent_change": False,
    }
    values.update(overrides)
    return Incident(**values)


def test_negated_signals_do_not_inflate_triage_severity():
    incident = make_incident(
        title="Post-change validation",
        description="Monitoring shows no outage and no errors after the configuration update.",
        service="analytics",
        environment="production",
        recent_change=True,
    )
    severity, _confidence, evidence = TriageAgent().run(incident)
    assert severity == "P3"
    assert "High-impact signal: 'outage'" not in evidence
    assert "Degradation signal: 'errors'" not in evidence


def test_vector_retrieval_matches_database_for_unknown_service():
    incident = make_incident(
        title="Billing database saturation",
        description="Database connection saturation and slow queries are affecting reads",
        service="billing-store",
    )
    name, steps, score = RunbookAgent().run(incident)
    assert name == "database.md"
    assert steps
    assert score > 0


def test_vector_retrieval_matches_queue_for_unknown_service():
    incident = make_incident(
        title="Shipping queue backlog",
        description="Worker queue depth is increasing and dispatch is delayed",
        service="shipping-worker",
    )
    name, steps, score = RunbookAgent().run(incident)
    assert name == "order-processing.md"
    assert steps
    assert score > 0


def test_low_similarity_unknown_service_falls_back_to_generic_runbook():
    incident = make_incident(
        title="Low-risk maintenance alert",
        description="A scheduled internal maintenance check reported one warning",
        service="ops-maintenance",
    )
    name, steps, _score = RunbookAgent().run(incident)
    assert name == "generic-incident.md"
    assert steps
