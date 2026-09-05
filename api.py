from __future__ import annotations

from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator

from src.models import Incident
from src.orchestrator import IncidentOrchestrator

app = FastAPI(
    title="AutonomousOps API",
    version="1.1.0",
    description="Event-driven incident orchestration API for the AutonomousOps portfolio project.",
)

orchestrator = IncidentOrchestrator()


class IncidentPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    incident_id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=240)
    description: str = Field(min_length=1, max_length=6000)
    service: str = Field(min_length=1, max_length=120)
    environment: str = Field(min_length=1, max_length=64)
    customer_impact: str = Field(min_length=1, max_length=2000)
    recent_change: bool = False
    source: str = Field(default="api", min_length=1, max_length=120)
    reporter: str = Field(default="api-client", min_length=1, max_length=120)

    @field_validator("service", "environment")
    @classmethod
    def normalize_lookup_fields(cls, value: str) -> str:
        return value.strip().lower()


@app.get("/health")
def health():
    return {"status": "ok", "service": "autonomousops", "paid_api_required": False}


@app.post("/v1/incidents")
def process_incident(
    payload: IncidentPayload,
    approved: bool = Query(default=False),
    decision: Literal["approve", "reject"] | None = Query(default=None),
):
    if approved and decision == "reject":
        raise HTTPException(status_code=400, detail="Approval and rejection cannot be requested together.")

    incident = Incident(**payload.model_dump())
    return orchestrator.process(
        incident,
        approval_granted=approved or decision == "approve",
        approval_rejected=decision == "reject",
    ).to_dict()
