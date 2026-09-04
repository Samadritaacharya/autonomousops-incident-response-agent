# 5-minute recruiter demo

## 0:00 — Business problem

"Operations teams lose time on repetitive incident triage, context gathering, runbook lookup, approval coordination and stakeholder communication. AutonomousOps turns an operational event into a governed incident-response workflow."

## 0:45 — Inject event

Use:

- Service: `checkout-api`
- Environment: `production`
- Impact: `Multiple customers cannot complete checkout`
- Recent change: checked

Run the workflow.

## 1:15 — Show orchestration

Point out:

- Triage Agent
- Runbook Retrieval Agent
- Root-Cause Agent
- Change-Risk Agent
- Resolution Agent
- Tool Executor
- Communications Agent

Explain that the generative model can enrich hypotheses, but deterministic policy owns approval and tools.

## 2:00 — Human approval

Open the Human approval tab. Show that the workflow pauses before a mutating production action. Approve the portfolio-safe simulation and show the resumed tool trace.

## 3:00 — Autonomous trigger

Create a GitHub issue from the incident template. GitHub Actions should run without a conversational prompt and post the orchestration output back to the issue.

## 4:00 — Evaluation

Run the evaluation suite and show measured severity, runbook and approval-gate accuracy. Emphasize that metrics are calculated from checked-in cases rather than invented.

## 4:40 — Microsoft Copilot Studio mapping

Open `docs/copilot-studio-implementation.md` and map the public system to:

- initial agent + instructions + knowledge
- tools / agent flows / connectors
- event trigger
- approval gate
- monitoring and evaluation
