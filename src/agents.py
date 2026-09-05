from __future__ import annotations

from collections import Counter
import math
from pathlib import Path
from typing import Dict, List, Tuple
import re

from .llm import LLMReasoner
from .models import Incident


SEVERITY_SLA = {"P1": 15, "P2": 30, "P3": 120, "P4": 480}


def _signal_present(text: str, term: str) -> bool:
    """Match a signal unless it is immediately negated (for example, 'no outage')."""
    if term not in text:
        return False
    escaped = re.escape(term).replace(r"\ ", r"\s+")
    negated = re.compile(rf"\b(?:no|not|without|never)\s+(?:\w+\s+){{0,2}}{escaped}\b")
    return negated.search(text) is None


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
            "degraded", "timeout", "latency", "multiple users", "failed jobs",
            "queue backlog", "queue depth", "worker processing", "delayed", "errors", "connection failures",
        ]

        for term in high:
            if _signal_present(text, term):
                score += 3
                evidence.append(f"High-impact signal: '{term}'")
        for term in medium:
            if _signal_present(text, term):
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
    """Retrieves the best grounded runbook with local TF-IDF cosine similarity plus service affinity."""

    SERVICE_HINTS = {
        "checkout-api": "api-latency.md",
        "order-processing": "order-processing.md",
        "customer-db": "database.md",
        "analytics": "generic-incident.md",
    }
    GENERIC_THRESHOLD = 0.08

    def __init__(self, runbook_dir: str = "knowledge/runbooks"):
        self.runbook_dir = Path(runbook_dir)

    @staticmethod
    def _tokens(text: str) -> List[str]:
        return re.findall(r"[a-z0-9]+", text.lower())

    @staticmethod
    def _vector(tokens: List[str], idf: Dict[str, float], unknown_idf: float) -> Dict[str, float]:
        counts = Counter(tokens)
        return {
            term: (1.0 + math.log(count)) * idf.get(term, unknown_idf)
            for term, count in counts.items()
        }

    @staticmethod
    def _cosine(left: Dict[str, float], right: Dict[str, float]) -> float:
        if not left or not right:
            return 0.0
        dot = sum(weight * right.get(term, 0.0) for term, weight in left.items())
        left_norm = math.sqrt(sum(weight * weight for weight in left.values()))
        right_norm = math.sqrt(sum(weight * weight for weight in right.values()))
        if not left_norm or not right_norm:
            return 0.0
        return dot / (left_norm * right_norm)

    def run(self, incident: Incident) -> Tuple[str, List[str], float]:
        documents = {
            path.name: path.read_text(encoding="utf-8")
            for path in self.runbook_dir.glob("*.md")
        }
        if not documents:
            return "generic-incident.md", [], 0.0

        tokenized = {name: self._tokens(content) for name, content in documents.items()}
        document_frequency: Counter[str] = Counter()
        for tokens in tokenized.values():
            document_frequency.update(set(tokens))

        count = len(documents)
        idf = {
            term: math.log((1 + count) / (1 + frequency)) + 1.0
            for term, frequency in document_frequency.items()
        }
        unknown_idf = math.log((1 + count) / 1) + 1.0
        vectors = {
            name: self._vector(tokens, idf, unknown_idf)
            for name, tokens in tokenized.items()
        }
        query = self._vector(
            self._tokens(f"{incident.service} {incident.title} {incident.description}"),
            idf,
            unknown_idf,
        )

        preferred = self.SERVICE_HINTS.get(incident.service)
        best_name = "generic-incident.md" if "generic-incident.md" in documents else next(iter(documents))
        best_score = -1.0
        for name, vector in vectors.items():
            score = self._cosine(query, vector)
            if name == preferred:
                score += 0.35
            if score > best_score:
                best_score = score
                best_name = name

        if preferred is None and best_score < self.GENERIC_THRESHOLD and "generic-incident.md" in documents:
            best_name = "generic-incident.md"

        content = documents[best_name]
        steps = [
            line[2:].strip()
            for line in content.splitlines()
            if line.strip().startswith("- ")
        ][:8]
        return best_name, steps, max(best_score, 0.0)


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
            bounded = [str(item).strip() for item in generated if str(item).strip()][:3]
            if bounded:
                return bounded

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
        if approval and status == "WAITING_FOR_APPROVAL":
            gate = "Human approval requested"
        elif status == "ACTION_BLOCKED":
            gate = "Remediation blocked by governance or operator decision"
        else:
            gate = "Governance checks passed"
        return (
            f"[{severity}] {incident.service}: {incident.title}. {gate}. "
            f"Workflow status: {status}. Next action: {action}. "
            f"Customer impact: {incident.customer_impact}."
        )
