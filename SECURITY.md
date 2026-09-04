# Security and governance

AutonomousOps is a portfolio-safe simulation. It does not contain credentials and it does not mutate real infrastructure.

- Never commit API keys, access tokens, customer data, or production incident payloads.
- Use repository/environment secrets for optional model credentials.
- The deterministic risk gate owns authorization; model output cannot override it.
- Production-like mutations are simulated and appear explicitly as simulated tool executions.
- High-severity and recent-production-change scenarios are approval gated.
- For a real implementation, use least-privilege identities, environment allowlists, audited approvals, staging validation, connector DLP policies and organization-specific incident/change controls.

If adapting this project for real systems, conduct a security review and threat model before enabling any write-capable connector or operational action.
