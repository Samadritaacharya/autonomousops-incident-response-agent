import csv
import json
from pathlib import Path


def _normalized_row(row: dict) -> dict:
    return {
        "incident_id": row["incident_id"],
        "title": row["title"],
        "description": row["description"],
        "service": row["service"],
        "environment": row["environment"],
        "customer_impact": row["customer_impact"],
        "recent_change": str(row["recent_change"]).lower() == "true",
        "expected_severity": row["expected_severity"],
        "expected_runbook": row["expected_runbook"],
        "expected_approval": str(row["expected_approval"]).lower() == "true",
    }


def test_python_and_web_evaluation_fixtures_are_identical():
    root = Path(__file__).resolve().parents[1]
    with (root / "data" / "sample_incidents.csv").open(encoding="utf-8", newline="") as handle:
        python_cases = [_normalized_row(row) for row in csv.DictReader(handle)]

    web_cases = json.loads((root / "frontend" / "lib" / "evaluation-fixtures.json").read_text(encoding="utf-8"))

    assert len(python_cases) == 24
    assert python_cases == web_cases
