from __future__ import annotations

import uuid
from typing import Dict

from .models import Incident, ToolExecution


class ToolRegistry:
    """Safe tool layer used by the public demo.

    All mutating actions are simulations. This deliberately demonstrates tool selection,
    policy gates and execution traces without touching real infrastructure.
    """

    READ_ONLY = {"collect diagnostics", "check dependency health", "inspect queue"}
    SAFE_MUTATIONS = {"refresh cache", "retry failed job", "scale worker", "clear stale queue"}

    def collect_diagnostics(self, incident: Incident) -> ToolExecution:
        signal = {
            "checkout-api": "p95 latency elevated; 5xx rate elevated",
            "order-processing": "queue depth elevated; oldest message age increasing",
            "customer-db": "connection failures detected; saturation suspected",
            "analytics": "scheduled refresh failed; upstream data available",
        }.get(incident.service, "service health signals collected")
        return ToolExecution("collect diagnostics", "SUCCEEDED", signal)

    def execute(self, action: str, incident: Incident, *, approved: bool) -> ToolExecution:
        normalized = action.lower().strip()
        read_match = next((x for x in self.READ_ONLY if x in normalized), None)
        safe_match = next((x for x in self.SAFE_MUTATIONS if x in normalized), None)
        if read_match:
            return ToolExecution(read_match, "SUCCEEDED", "Read-only diagnostic tool executed.")
        if safe_match:
            if approved or incident.environment.lower() != "production":
                return ToolExecution(
                    safe_match,
                    "SUCCEEDED",
                    "Portfolio-safe remediation simulation completed; no real system was changed.",
                )
            return ToolExecution(
                safe_match,
                "BLOCKED",
                "Production mutation blocked because explicit approval was not provided.",
            )
        return ToolExecution(
            normalized or "unknown action",
            "BLOCKED",
            "Action is not in the allowlist and was not executed.",
        )

    def request_approval(self, incident: Incident, action: str) -> Dict[str, str]:
        return {
            "approval_id": f"APR-{uuid.uuid4().hex[:8].upper()}",
            "message": f"Approval requested for '{action}' on {incident.service}.",
        }
