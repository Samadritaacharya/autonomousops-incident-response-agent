# Interactive Command Center architecture

The `frontend/` application is the public, zero-required-paid-service presentation layer for AutonomousOps.

## Runtime split

```text
Browser
  ├─ Next.js React UI
  ├─ React Three Fiber agent graph
  ├─ ShaderGradient atmosphere
  └─ localStorage (last five demo runs only)
        |
        v
Next.js route handlers
  ├─ POST /api/incidents
  ├─ GET  /api/evaluation
  └─ GET  /api/health
        |
        v
Deterministic TypeScript agent contract
  ├─ triage
  ├─ runbook selection
  ├─ bounded root-cause hypotheses
  ├─ approval policy
  ├─ allowlisted resolution
  ├─ simulated tools
  └─ stakeholder communication
```

The existing Python implementation remains the canonical full project backend. The TypeScript engine intentionally mirrors its public deterministic behavior so a Vercel deployment can demonstrate the complete incident lifecycle without provisioning a Python service, database, model key or other paid infrastructure.

## Contract parity

The web engine shares the same eight synthetic cases as `data/sample_incidents.csv`. CI asserts:

- expected P1-P4 severity;
- expected runbook;
- expected approval requirement;
- high-risk pause before mutation;
- explicit approval resumes the safe simulation;
- explicit rejection blocks remediation.

The production Next.js build is then started in CI and exercised over HTTP through the health, waiting-for-approval and approved paths.

## Generative reasoning

The hosted command center displays `deterministic-fallback` by design. The Python backend's optional generative reasoner remains available for local/private deployments. Generative output may enrich root-cause hypotheses, but it must never own severity, approval or tool authorization.

## Free deployment posture

The application requires no runtime account besides whichever host is chosen. It has no required external API, auth, database, telemetry or asset CDN.

For Vercel, configure the repository root directory as `frontend`. Hobby hosting is a convenient free public-demo option within Vercel's published plan quotas. The app is not architecturally dependent on Vercel and can run with `npm run dev` / `npm start` on any compatible Node host.
