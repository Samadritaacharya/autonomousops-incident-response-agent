from __future__ import annotations

import uuid

import pandas as pd
import streamlit as st

from src.evaluator import evaluate_dataset
from src.models import Incident
from src.orchestrator import IncidentOrchestrator


st.set_page_config(page_title="AutonomousOps", page_icon="🤖", layout="wide")

st.title("AutonomousOps — AI Incident Response & Service Recovery")
st.caption(
    "Event-driven multi-agent orchestration with grounded runbooks, tool use, "
    "approval gates, stakeholder communications and an auditable decision trace."
)

with st.sidebar:
    st.header("Agent stack")
    st.markdown(
        "**Trigger → Triage → Runbook Retrieval → Root-Cause Hypotheses → "
        "Risk Gate → Resolution Planner → Tools → Communications → Audit**"
    )
    st.info("All infrastructure mutations are simulated. No real production systems are changed.")
    st.markdown("**Generative layer**")
    st.caption(
        "Optional OpenAI-compatible reasoning is enabled when `OPENAI_API_KEY` is set. "
        "Safety, severity and tool authorization remain deterministic."
    )

orchestrator = IncidentOrchestrator(runbook_dir="knowledge/runbooks")

if "last_incident" not in st.session_state:
    st.session_state.last_incident = None
if "last_result" not in st.session_state:
    st.session_state.last_result = None


def render_result(result):
    st.subheader("Autonomous decision")
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Severity", result.severity)
    c2.metric("Confidence", f"{result.confidence:.0%}")
    c3.metric("SLA target", f"{result.sla_minutes} min")
    c4.metric("Workflow", result.status.replace("_", " ").title())

    st.caption(f"Trace `{result.trace_id}` · Reasoning mode `{result.llm_mode}`")
    st.write(f"**Grounded runbook:** `{result.runbook}`")

    left, right = st.columns(2)
    with left:
        st.markdown("#### Root-cause hypotheses")
        for item in result.root_cause_hypotheses:
            st.write(f"- {item}")
        st.markdown("#### Governance evidence")
        for item in result.evidence:
            st.write(f"- {item}")
        if result.approval_id:
            st.warning(f"Approval gate active · `{result.approval_id}`")

    with right:
        st.markdown("#### Tool executions")
        for tool in result.tool_executions:
            icon = "✅" if tool.status == "SUCCEEDED" else "⏳" if tool.status == "PENDING" else "🛑"
            st.write(f"{icon} **{tool.tool}** — {tool.status}")
            st.caption(tool.message)
        st.markdown("#### Recommended runbook actions")
        for item in result.recommended_actions:
            st.write(f"- {item}")

    st.markdown("#### Stakeholder communication")
    st.success(result.stakeholder_message)

    with st.expander("Full multi-agent trace"):
        for step in result.agent_trace:
            st.markdown(f"**{step.agent} — {step.status}**")
            st.write(step.summary)
            if step.evidence:
                for item in step.evidence:
                    st.caption(f"• {item}")
            st.caption(f"Duration: {step.duration_ms} ms")


tab1, tab2, tab3, tab4 = st.tabs(
    ["Live autonomous incident", "Human approval", "Evaluation", "Architecture & business value"]
)

with tab1:
    left, right = st.columns([0.95, 1.05])
    with left:
        st.subheader("Inject an operational event")
        title = st.text_input("Incident title", "Checkout API timeouts")
        description = st.text_area(
            "Description",
            "Production checkout requests are timing out for multiple users after a deployment.",
            height=110,
        )
        service = st.selectbox(
            "Service", ["checkout-api", "order-processing", "customer-db", "analytics", "generic-service"]
        )
        environment = st.selectbox("Environment", ["production", "staging", "development"])
        impact = st.text_input("Customer impact", "Multiple customers cannot complete checkout")
        recent_change = st.checkbox("Recent deployment/change detected", value=True)
        run = st.button("Run autonomous workflow", type="primary", use_container_width=True)

        if run:
            incident = Incident(
                incident_id=f"INC-{uuid.uuid4().hex[:6].upper()}",
                title=title,
                description=description,
                service=service,
                environment=environment,
                customer_impact=impact,
                recent_change=recent_change,
                source="streamlit-event",
            )
            result = orchestrator.process(incident)
            st.session_state.last_incident = incident
            st.session_state.last_result = result

    with right:
        if st.session_state.last_result:
            render_result(st.session_state.last_result)
        else:
            st.info("Inject an event to see the multi-agent workflow and tool trace.")

with tab2:
    st.subheader("Human-in-the-loop governance")
    result = st.session_state.last_result
    incident = st.session_state.last_incident
    if not result or not incident:
        st.info("Run a live incident first.")
    elif not result.requires_approval:
        st.success("The latest incident is low-risk and does not require human approval.")
    elif result.status != "WAITING_FOR_APPROVAL":
        st.success(f"The latest workflow has already moved to `{result.status}`.")
    else:
        st.warning(
            f"{result.severity} incident requires explicit approval before the proposed action: "
            f"**{result.auto_action}**"
        )
        a, b = st.columns(2)
        with a:
            if st.button("Approve simulated remediation", type="primary", use_container_width=True):
                approved = orchestrator.process(incident, approval_granted=True)
                st.session_state.last_result = approved
                st.rerun()
        with b:
            if st.button("Reject and keep escalated", use_container_width=True):
                st.info("Approval rejected. No mutating tool was executed.")

with tab3:
    st.subheader("Measured agent evaluation")
    st.caption("Metrics are calculated from the repository test dataset; no portfolio numbers are invented.")
    if st.button("Run evaluation suite", type="primary"):
        output, metrics = evaluate_dataset("data/sample_incidents.csv")
        c1, c2, c3 = st.columns(3)
        c1.metric("Severity accuracy", f"{metrics['severity_accuracy']:.0%}")
        c2.metric("Runbook accuracy", f"{metrics['runbook_accuracy']:.0%}")
        c3.metric("Approval-gate accuracy", f"{metrics['approval_gate_accuracy']:.0%}")
        st.dataframe(output, use_container_width=True)
    else:
        st.dataframe(pd.read_csv("data/sample_incidents.csv"), use_container_width=True)

with tab4:
    st.markdown(
        """
### Business problem
Incident response is often slowed by manual triage, scattered operational context, inconsistent runbook execution,
unsafe automation and repetitive stakeholder communication. AutonomousOps demonstrates a governed incident-to-resolution
pattern rather than another chat-only assistant.

### Why it is agentic
- **Autonomous trigger:** operational events can start the workflow without a conversational prompt.
- **Specialist agents:** triage, knowledge retrieval, root-cause analysis, risk, resolution and communications have separate responsibilities.
- **Generative reasoning:** an optional LLM enriches hypotheses while deterministic policy owns authorization boundaries.
- **Tool orchestration:** diagnostics and allowlisted remediation tools produce a visible execution trace.
- **Human approval:** high-impact production changes cannot bypass the approval gate.
- **Evaluation + AgentOps:** every run has a trace ID, audit record and measurable test outcomes.

### Microsoft Copilot Studio mapping
The public implementation mirrors the three learning areas: initial agent design and knowledge grounding, tools/agent flows,
and autonomous event triggers. `docs/copilot-studio-implementation.md` provides the enterprise Copilot Studio blueprint.
        """
    )

    st.code(
        """Operational Event
      │
      ▼
AI Orchestrator
 ├─ Triage Agent
 ├─ Runbook Agent
 ├─ Root-Cause Agent
 ├─ Risk Gate
 └─ Resolution Planner
      │
      ├── safe ──► Tool Executor
      └── risky ─► Human Approval ─► Tool Executor
                         │
                         ▼
              Communications + Audit""",
        language="text",
    )
