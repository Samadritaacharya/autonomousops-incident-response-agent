from __future__ import annotations

from fastapi import FastAPI, Query
from pydantic import BaseModel

from src.models import Incident
from src.orchestrator import IncidentOrchestrator

app = FastAPI(
    title="AutonomousOps API",
    version="1.0.0",
    description="Event-driven incident orchestration API for the AutonomousOps portfolio project.",
)

orchestrator = IncidentOrchestrator()


class IncidentPayload(BaseModel):
    incident_id: str
    title: str
    description: str
    service: str
    environment: str
    customer_impact: str
    recent_change: bool = False
    source: str = "api"
    reporter: str = "api-client"


@app.get("/health")
def health():
    return {"status": "ok", "service": "autonomousops"}


@app.post("/v1/incidents")
def process_incident(payload: IncidentPayload, approved: bool = Query(default=False)):
    incident = Incident(**payload.model_dump())
    return orchestrator.process(incident, approval_granted=approved).to_dict()
