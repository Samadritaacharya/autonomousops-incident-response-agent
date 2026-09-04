# Deployment guide

AutonomousOps has two public-facing services:

- **Streamlit recruiter UI** — `app.py`
- **FastAPI event API** — `api.py`

The GitHub Issues workflow is already hosted by GitHub Actions and requires no separate server.

## Option A — Streamlit Community Cloud for the recruiter UI

1. Sign in to Streamlit Community Cloud with GitHub.
2. Choose **Create app** / **Deploy an app**.
3. Repository: `Samadritaacharya/autonomousops-incident-response-agent`
4. Branch: `main`
5. Main file: `app.py`
6. Deploy.

The app works without model credentials. For optional generative root-cause reasoning, add this in the app's secret management rather than committing it:

```toml
OPENAI_API_KEY = "your-key"
OPENAI_MODEL = "gpt-5-mini"
```

Do not paste credentials into README files, issues, code, screenshots or public logs.

## Option B — Container platform for both UI and API

The repository contains `Dockerfile` and `docker-compose.yml`.

```bash
cp .env.example .env
docker compose up --build
```

Services:

- UI: `http://localhost:8501`
- API: `http://localhost:8000`
- API docs: `http://localhost:8000/docs`

For Render, Railway, Azure Container Apps or a comparable container platform, deploy the same image twice:

### UI service

```text
streamlit run app.py --server.address=0.0.0.0 --server.port=$PORT
```

### API service

```text
uvicorn api:app --host 0.0.0.0 --port $PORT
```

Store model credentials as platform environment secrets.

## GitHub autonomous workflow

No hosting is required for the GitHub event path:

1. Create an issue from **AutonomousOps incident demo**.
2. The issue event invokes `.github/workflows/incident-agent-demo.yml`.
3. AutonomousOps comments the triage and approval decision back to the issue.
4. An authorized repository owner/collaborator can comment `/approve` or `/reject`.
5. `/approve` resumes the governed simulation and executes the allowlisted simulated remediation.

## Production warning

The public repository deliberately uses synthetic telemetry and simulated remediation. A real operational deployment requires organization-owned identity, secrets, authorization, change controls, DLP, connector policies, environment allowlists, audit retention and human approval design.
