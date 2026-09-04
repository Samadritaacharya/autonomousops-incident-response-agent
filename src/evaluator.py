from __future__ import annotations

from pathlib import Path
import pandas as pd

from .models import Incident
from .orchestrator import IncidentOrchestrator


def evaluate_dataset(path: str | Path, *, log_path: str = ".tmp/eval-log.jsonl") -> tuple[pd.DataFrame, dict]:
    df = pd.read_csv(path)
    orchestrator = IncidentOrchestrator(log_path=log_path)
    rows = []
    for raw in df.to_dict(orient="records"):
        incident = Incident(
            incident_id=raw["incident_id"],
            title=raw["title"],
            description=raw["description"],
            service=raw["service"],
            environment=raw["environment"],
            customer_impact=raw["customer_impact"],
            recent_change=str(raw["recent_change"]).lower() == "true",
            source="evaluation",
        )
        result = orchestrator.process(incident)
        expected_approval = str(raw["expected_approval"]).lower() == "true"
        rows.append(
            {
                "incident_id": incident.incident_id,
                "severity": result.severity,
                "expected_severity": raw["expected_severity"],
                "severity_ok": result.severity == raw["expected_severity"],
                "runbook": result.runbook,
                "expected_runbook": raw["expected_runbook"],
                "runbook_ok": result.runbook == raw["expected_runbook"],
                "approval": result.requires_approval,
                "expected_approval": expected_approval,
                "approval_ok": result.requires_approval == expected_approval,
                "status": result.status,
            }
        )
    out = pd.DataFrame(rows)
    metrics = {
        "cases": len(out),
        "severity_accuracy": float(out["severity_ok"].mean()) if len(out) else 0.0,
        "runbook_accuracy": float(out["runbook_ok"].mean()) if len(out) else 0.0,
        "approval_gate_accuracy": float(out["approval_ok"].mean()) if len(out) else 0.0,
    }
    return out, metrics
