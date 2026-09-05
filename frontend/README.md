# AutonomousOps Command Center

Modern Next.js front end and serverless demo API for the AutonomousOps multi-agent incident-response project.

## What runs here

- Interactive incident simulator
- Deterministic server-side agent engine mirroring the Python governance contract
- Human approval / rejection path
- Agent and tool execution traces
- React Three Fiber orchestration graph
- ShaderGradient atmospheric hero
- Original liquid-metal orchestrator shader
- Reproducible 8-case evaluation endpoint
- Local-only session history

No API key is required. The hosted demo intentionally stays on deterministic fallback so anyone can run it without a paid model account.

## Local development

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

## Validation

```bash
npm run typecheck
npm test
npm run build
```

Health endpoint:

```bash
curl http://localhost:3000/api/health
```

Incident endpoint:

```bash
curl -X POST http://localhost:3000/api/incidents \
  -H "Content-Type: application/json" \
  -d '{
    "incident_id":"WEB-1",
    "title":"Checkout API timeouts",
    "description":"Production checkout requests are timing out for multiple users after a deployment",
    "service":"checkout-api",
    "environment":"production",
    "customer_impact":"Multiple customers cannot complete checkout",
    "recent_change":true
  }'
```

Use `?approved=true` or include `"decision":"approve"` to test the approved path. Include `"decision":"reject"` to test a rejected high-risk remediation.

## Vercel

Import the GitHub repository in Vercel and set **Root Directory** to `frontend`. No environment variables are necessary for the public deterministic demo.

Vercel Hobby is useful as a zero-cost public portfolio host within its published quotas. It is not an unlimited-usage guarantee. The app remains vendor-independent and can always run locally or on any Node-compatible host.

## Why there is no mandatory LLM call

The Python project already supports optional generative root-cause reasoning. For the public front end, a required external LLM would violate the project's zero-required-paid-service rule and could make a recruiter demo fail when a quota or key expires. The web engine therefore demonstrates the complete orchestration and governance path deterministically. A future model adapter can enrich root-cause hypotheses without changing the policy boundary.
