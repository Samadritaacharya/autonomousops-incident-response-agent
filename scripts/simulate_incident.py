import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.models import Incident
from src.orchestrator import IncidentOrchestrator

incident = Incident(
    incident_id="INC-DEMO",
    title="Checkout API timeouts",
    description="Production checkout requests are timing out for multiple users after a deployment.",
    service="checkout-api",
    environment="production",
    customer_impact="Multiple customers cannot complete checkout",
    recent_change=True,
    source="cli-demo",
)

result = IncidentOrchestrator().process(incident)
print(json.dumps(result.to_dict(), indent=2))
