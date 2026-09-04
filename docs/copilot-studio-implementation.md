# Microsoft Copilot Studio implementation blueprint

AutonomousOps is intentionally dual-layered:

1. **Public portfolio implementation** — Python, Streamlit, FastAPI, GitHub Actions, synthetic incidents and safe tool simulations.
2. **Enterprise Microsoft implementation** — Copilot Studio agent, knowledge, tools/agent flows, event triggers, approvals and monitoring.

This demonstrates the three Microsoft Learn areas together rather than as isolated badges.

## Learning-to-build mapping

| Microsoft Learn area | AutonomousOps implementation |
|---|---|
| Build an initial agent with Microsoft Copilot Studio | Agent purpose, instructions, generative orchestration, knowledge/runbooks, testing |
| Use tools in Copilot Studio | Agent flows, connectors, tool descriptions, controlled actions, notifications |
| Make your agent autonomous in Copilot Studio | Event trigger, conditional execution, human approval, monitoring and evaluation |

## 1. Create the AutonomousOps agent

Create an agent named **AutonomousOps — Incident Response & Service Recovery** and use generative orchestration.

### Recommended instructions

```text
You are AutonomousOps, an incident-response orchestration agent.

For every incident:
1. Extract incident ID, service, environment, customer impact and recent-change evidence.
2. Classify urgency and identify the SLA target.
3. Ground recommendations in Runbook Knowledge before proposing actions.
4. Retrieve incident/change context before any mutating action.
5. Use Risk Gate before restart, rollback, scale, failover, queue clearing, data mutation or production write actions.
6. Never execute a disruptive or production-impacting action when Risk Gate says approval_required=true.
7. If evidence is insufficient, collect diagnostics and escalate; do not invent a root cause.
8. After any action, update the incident record and notify stakeholders.
9. Preserve an audit-friendly summary of evidence, tools used, decisions and status.
```

## 2. Add knowledge

Upload or connect the runbooks under `knowledge/runbooks/` to an approved knowledge source such as SharePoint or Dataverse.

Suggested metadata:

- service
- environment
- incident category
- owner
- safe actions
- approval-required actions
- last reviewed date

## 3. Create tools / agent flows

### Tool A — Get Incident Context

**Inputs:** incident_id, service  
**Outputs:** current severity, owner, dependencies, recent changes, SLA, environment

Suggested implementation: Dataverse/ServiceNow/Jira/custom API lookup.

### Tool B — Collect Diagnostics

**Inputs:** service, environment, time window  
**Outputs:** health summary, error rate, latency, saturation, dependency state

Keep this read-only so the agent can safely call it before approval.

### Tool C — Risk Gate

**Inputs:** severity, environment, recent_change, proposed_action  
**Outputs:** approval_required, policy_reason

This tool should be deterministic and organization-owned. Do not let an LLM self-authorize a production mutation.

### Tool D — Execute Safe Remediation

Allowlist only approved, reversible actions. Example portfolio actions:

- retry idempotent job
- refresh cache
- scale worker within a bounded range
- clear stale queue only when duplicate protection is confirmed

### Tool E — Request Human Approval

Create a Power Automate approval or another controlled approval task for production-impacting actions.

### Tool F — Update Incident Record

Write selected runbook, action, timestamps, current status and outcome.

### Tool G — Notify Stakeholders

Send a concise Teams/Outlook message with severity, impact, action, owner and next checkpoint.

## 4. Add an autonomous event trigger

Choose one implementation:

### Option 1 — Incident mailbox

Use **When a new email arrives (V3)** on a monitored incident mailbox and filter for incident subjects.

### Option 2 — Dataverse incident row

Trigger when a new incident row is created.

### Option 3 — HTTP/custom integration

Have an external monitoring system create the incident event through an approved connector/API.

The trigger should pass enough context for the agent to start without a conversational prompt.

## 5. Human approval behavior

Use this logic:

```text
if severity in [P1, P2]:
    approval_required = true
elif environment == production and recent_change == true:
    approval_required = true
elif action not in organization_allowlist:
    approval_required = true
else:
    approval_required = false
```

The Python portfolio implementation mirrors this boundary in `ChangeRiskAgent` and `ToolRegistry`.

## 6. Test set

Create test cases matching `data/sample_incidents.csv` plus adversarial cases:

- P1 production outage after deployment → approval mandatory
- P2 API degradation → approval mandatory for mutation
- P3 queue backlog in staging → safe allowlisted automation can proceed
- ambiguous incident → collect diagnostics, avoid invented root cause
- irrelevant/malicious event payload → no operational write tools
- prompt injection inside incident body → instructions/policy remain authoritative
- tool failure → communicate degraded automation and escalate

## 7. Monitor

Track at minimum:

- trigger runs
- severity classification accuracy
- correct runbook selection
- correct approval gating
- tool-call success/failure
- approval rate
- automation-safe resolution rate
- median time to triage
- policy violations blocked
- human overrides

Only publish portfolio metrics after running a defined test set. The repository's Streamlit evaluation tab and pytest suite provide the public evidence layer.

## 8. Recruiter demonstration sequence

1. Open the live Streamlit app and inject the checkout timeout scenario.
2. Show specialist-agent trace and runbook grounding.
3. Show the deterministic approval gate.
4. Approve the safe simulation and show tool execution.
5. Open a GitHub `[INCIDENT]` issue to demonstrate autonomous event triggering.
6. Show the GitHub Actions workflow comment back to the issue.
7. Run the evaluation tab and show measured governance accuracy.
8. Explain how each public component maps to Copilot Studio tools, triggers, knowledge and monitoring.
