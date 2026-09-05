# AutonomousOps — Interview Defense Guide

This guide is intentionally direct. It explains what the project proves, what it does not prove, and how to defend the architectural choices in a technical or TPM/PMO interview without overselling the system.

## 60-second explanation

AutonomousOps is an event-driven incident-governance and service-recovery portfolio system. A synthetic incident enters through the web simulator, FastAPI, Streamlit, or a GitHub Issue. Deterministic logic classifies severity and SLA, retrieves a repository runbook with local TF-IDF cosine similarity plus service affinity, generates bounded root-cause hypotheses, evaluates change risk, and selects an allowlisted remediation candidate. High-risk scenarios pause for explicit human approval. Tool execution is simulated, stakeholder communication is generated from the trace, and the entire run remains auditable.

The optional LLM is deliberately not the control plane. It can enrich root-cause hypotheses only. Severity, approval requirements, tool authorization, and remediation permission are deterministic.

## What the 100% evaluation result means

The repository currently reports 24/24 correct outcomes for severity, runbook selection, and approval gating on the checked-in synthetic evaluation set.

That means:

- the current implementation matches all expected labels in those 24 authored regression scenarios;
- Python and TypeScript evaluate the same fixture set;
- the result is reproducible in CI;
- the metric is useful as regression evidence for this repository.

It does **not** mean:

- 100% accuracy on real production incidents;
- statistical generalization to unseen enterprise environments;
- validated MTTR reduction, outage avoidance, or business impact;
- a production-ready replacement for incident commanders or SRE tooling.

A good interview sentence is:

> “The 100% number is a regression result on 24 checked-in synthetic scenarios, not a production-accuracy claim. I use it to prove deterministic behavior and prevent regressions, not to claim generalization.”

## Why deterministic controls instead of full LLM autonomy?

Operational authorization is a poor place for probabilistic behavior. A model can be helpful at generating hypotheses, summarizing evidence, or suggesting possibilities, but it should not become the authority that changes severity, approves its own action, or bypasses a change-control boundary.

The project therefore separates reasoning from authority:

| Concern | Owner |
|---|---|
| Severity and SLA | deterministic policy |
| Runbook ranking | local vector similarity + service affinity |
| Root-cause hypotheses | optional LLM or deterministic fallback |
| Approval requirement | deterministic risk policy |
| Tool permission | allowlist + environment/approval checks |
| Remediation | simulated tool executor |
| Auditability | structured agent/tool trace |

This is the core governance argument of the project.

## Why TF-IDF instead of an embedding API?

The current retrieval layer uses local TF-IDF cosine similarity because the knowledge base is intentionally small and inspectable. For this portfolio scope it has three advantages:

1. no API key, network dependency, or paid inference service is required;
2. matching behavior is deterministic and easy to debug;
3. the implementation is sufficient to demonstrate vector-space retrieval and fallback behavior on the current runbook corpus.

The production-scale answer is not “TF-IDF is always better.” The scale-up path would evaluate embeddings or hybrid retrieval when the runbook corpus becomes large, semantically diverse, multilingual, or noisy. That change should be measured against a larger retrieval benchmark rather than adopted only because embeddings sound more advanced.

## Why maintain Python and TypeScript implementations?

The Python implementation is the canonical full backend and contains the optional generative layer. The TypeScript implementation exists so the public Next.js demo can run without a separate backend deployment or required paid service.

The risk is contract drift. The repository therefore shares the evaluation fixtures and enforces parity in tests. If the two engines are kept long term, the next maturity step would be extracting a single language-neutral contract and adding cross-engine golden-output tests for all governance-critical decisions.

## Known limitations

Be ready to name these before an interviewer has to discover them:

- incidents and labels are synthetic and authored for the project;
- infrastructure changes are simulated;
- the runbook corpus is deliberately small;
- severity remains rules-based rather than learned from production history;
- optional LLM reasoning is bounded and not required for the public demo;
- there is no production identity provider, secrets manager, CMDB, observability backend, or enterprise change-management integration;
- there is no claim of measured real-world MTTR, cost, reliability, or customer-impact improvement.

These are scope boundaries, not hidden defects.

## How I would productionize it

A sensible enterprise roadmap would be:

1. connect real read-only observability sources first;
2. introduce service identity, least-privilege credentials, and secrets management;
3. expand and independently label the evaluation set using historical incident data;
4. benchmark retrieval quality before selecting TF-IDF, embeddings, or hybrid retrieval;
5. integrate CMDB/change records and policy-as-code;
6. keep mutating tools behind explicit approval until enough evidence exists for narrower automated cases;
7. add production tracing, replay, cost/latency monitoring, and failure-mode evaluation;
8. run shadow-mode or recommendation-only trials before enabling any real write path.

## Questions a sharp interviewer may ask

### “Where is the AI?”

The optional generative model contributes bounded root-cause hypotheses. The retrieval layer is vector-space information retrieval. The orchestration is agent-shaped, but the governance-critical control plane is intentionally deterministic. The point is not to maximize LLM usage; it is to demonstrate a safe operating model for AI-assisted incident response.

### “Why call these agents if much of the logic is deterministic?”

Each component has a distinct responsibility, input/output contract, and trace evidence: triage, retrieval, root cause, risk, resolution, execution, and communication. The architecture is agent-oriented, while the autonomy level differs by responsibility. Deterministic agents are a deliberate governance choice for high-impact decisions.

### “What does 24/24 actually prove?”

It proves that the checked-in implementation matches the expected labels for the 24 regression fixtures and that the behavior is reproducible across CI. It does not prove generalization beyond that set.

### “Would you let this touch production?”

Not in its portfolio form. The README and security documentation explicitly say all mutations are simulated. Production use would require organization-specific IAM, change policy, DLP, secrets management, observability, rollback design, audit retention, and a validated evaluation program.

### “What is the most important design decision?”

Separating probabilistic reasoning from operational authority. The LLM can suggest; deterministic policy and human approval decide whether a mutating action is allowed.
