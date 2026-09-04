from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.evaluator import evaluate_dataset


def main() -> int:
    output, metrics = evaluate_dataset("data/sample_incidents.csv", log_path=".tmp/ci-eval.jsonl")
    print(json.dumps(metrics, indent=2))
    print(output.to_string(index=False))
    return 0 if all(
        [
            metrics["severity_accuracy"] >= 0.875,
            metrics["runbook_accuracy"] == 1.0,
            metrics["approval_gate_accuracy"] == 1.0,
        ]
    ) else 1


if __name__ == "__main__":
    raise SystemExit(main())
