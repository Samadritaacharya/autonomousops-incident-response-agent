from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Tuple
import re

from .llm import LLMReasoner
from .models import Incident


SEVERITY_SLA = {"P1": 15, "P2": 30, "P3": 120, "P4": 480}


class TriageAgent:
    """Classifies operational urgency from impact, environment and incident text."""

    def run(self, incident: Incident) -> Tuple[str, float, List[str]]:
        text = f"{incident.title} {incident.description} {incident.customer_impact}".lower()
        evidence: List[str] = []
        score = 0

        high = [
            "outage", "unavailable", "all users", "production down", "payment failure",
            "data loss", "security breach", "cannot checkout", "cannot complete checkout",
        ]
        medium = [
            "degraded", "timeout", "timeouts", "latency", "multiple users", "failed jobs",
            "queue backlog", "queue depth", "worker processing", "delayed", "errors", "connection failures",
        ]

        for term in high:
            if term in text:
                score += 3
                evidence.append(f"High-impact signal: '{term}'")
        for term in medium:
            if term in text:
                score += 1
                evidence.append(f"Degradation signal: '{term}'")

        if incident.environment.lower() == "production":
            score += 1
            evidence.append("Production environment")
        if incident.recent_change:
            score += 1
            evidence.append("Recent change/deployment detected")

        if score >= 7:
            severity, confidence = "P1", 0.94
        elif score >= 4:
            severity, confidence = "P2", 0.89
        elif score >= 2:
            severity, confidence = "P3", 0.82
        else:
            severity, confidence = "P4", 0.76

        if not evidence:
            evidence.append("No critical impact keywords detected")
        return severity, confidence, evidence


class RunbookAgent:
    """Retrieves the best grounded runbook using token overlap plus service affinity."""

    SERVICE_HINTS = {
        "checkout-api": "api-latency.md",
        "order-processing": "order-processing.md",
        "customer-db": "database.md",
        "analytics": "generic-incident.md",
    }

    def __init__(self, runbook_dir: str = "knowledge/runbooks"):
        self.runbook_dir = Path(runbook_dir)

    @staticmethod
    def _tokens(text: str) -> set[str]:
        return set(re.findall(r"[a-z0-9]+", text.lower()))

    def run(self, incident: Incident) -> Tuple[str, List[str], float]:
        query = self._tokens(f"{incident.service} {incident.title} {incident.description}")
        preferred = self.SERVICE_HINTS.get(incident.service)
        best_name = "generic-incident.md"
        best_score = -1.0
        best_steps: List[str] = []

        for path in self.runbook_dir.glob("*.md"):
            content = path.read_text(encoding="utf-8")
            tokens = self._tokens(content)
            score = len(query & tokens) / max(len(query | tokens), 1)
            if path.name == preferred:
                score += 0.35
            if score > best_score:
                best_score = score
                best_name = path.name
                best_steps = [
                    line[2:].strip()
                    for line in content.splitlines()
                    if line.strip().startswith("- ")
                ][:8]
        return best_name, best_steps, max(best_score, 0.0)


class RootCauseAgent:
    """Produces hypotheses while keeping deterministic governance authoritative."""

    def __init__(self, reasoner: LLMReasoner | None = None):
        self.reasoner = reasoner or LLMReasoner()

    def run(self, incident: Incident, runbook: str, steps: List[str]) -> List[str]:
        text = (
            f"{incident.service}; {incident.environment}; {incident.title}; "
            f"{incident.description}; impact={incident.customer_impact}; "
            f"recent_change={incident.recent_change}"
        )
        generated = self.reasoner.root_cause_hypotheses(
            incident_text=text,
            runbook_name=runbook,
            runbook_steps=steps,
        )
        if generated:
            return generated

        hypotheses: List[str] = []
        if incident.recent_change:
            hypotheses.append("A recent deployment or configuration change may correlate with the incident.")
        service_hypothesis = {
            "checkout-api": "API resource saturation or an unhealthy upstream dependency may be increasing latency.",
            "order-processing": "Worker capacity, queue growth or a failing downstream dependency may be delaying orders.",
            "customer-db": "Database connection saturation, locks or availability degradation may be blocking requests.",
            "analytics": "A scheduled job, dependency or transient data-refresh failure may have interrupted processing.",
        }.get(incident.service)
        if service_hypothesis:
            hypotheses.append(service_hypothesis)
        if not hypotheses:
            hypotheses.append("Insufficient evidence for a specific root cause; collect diagnostics before remediation.")
        return hypotheses[:3]


class ChangeRiskAgent:
    """Policy agent: determines whether mutating remediation requires approval."""

    def run(self, incident: Incident, severity: str) -> Dict[str, object]:
        if severity in {"P1", "P2"}:
            return {
                "requires_approval": True,
                "reason": "High-severity incident: human approval required before mutating remediation.",
            }
        if incident.recent_change and incident.environment.lower() == "production":
            return {
                "requires_approval": True,
                "reason": "Recent production change detected: operator validation is required before remediation.",
            }
        return {
            "requires_approval": False,
            "reason": "Low-risk scenario: allowlisted remediation may run after diagnostics.",
        }


class ResolutionAgent:
    """Chooses the best allowlisted action from grounded runbook steps."""

    SAFE_ACTIONS = (
        "refresh cache",
        "retry failed job",
        "scale worker",
        "clear stale queue",
    )

    def run(self, incident: Incident, runbook_steps: List[str], requires_approval: bool) -> Tuple[str, List[str]]:
        actions = runbook_steps or [
            "Collect diagnostics and recent logs",
            "Check recent deployment/change history",
            "Validate service health and dependencies",
        ]

        candidates = [a for a in actions if any(safe in a.lower() for safe in self.SAFE_ACTIONS)]
        proposed = candidates[0] if candidates else "Collect diagnostics"

        if requires_approval and proposed.lower() != "collect diagnostics":
            return proposed, actions
        if proposed.lower() == "collect diagnostics":
            return "Collect diagnostics", actions
        return proposed, actions


class CommunicationsAgent:
    def run(
        self,
        incident: Incident,
        severity: str,
        action: str,
        approval: bool,
        status: str,
    ) -> str:
        gate = "Human approval requested" if approval and status == "WAITING_FOR_APPROVAL" else "Governance checks passed"
        return (
            f"[{severity}] {incident.service}: {incident.title}. {gate}. "
            f"Workflow status: {status}. Next action: {action}. "
            f"Customer impact: {incident.customer_impact}."
        )
