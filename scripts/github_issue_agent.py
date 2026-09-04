"""Turn GitHub issue events and approval comments into an AutonomousOps workflow."""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.models import Incident
from src.orchestrator import IncidentOrchestrator


def field(body: str, heading: str, default: str = "") -> str:
    pattern = rf"###\s+{re.escape(heading)}\s*\n+(.+?)(?=\n###\s+|\Z)"
    match = re.search(pattern, body, re.I | re.S)
    if not match:
        return default
    value = match.group(1).strip()
    return "" if value == "_No response_" else value


def parse_bool(value: str) -> bool:
    return value.strip().lower() in {"yes", "true", "y", "1", "recent change detected"}


def headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
    }


def post_comment(repo: str, issue_number: int, token: str, body: str) -> None:
    response = requests.post(
        f"https://api.github.com/repos/{repo}/issues/{issue_number}/comments",
        headers=headers(token),
        json={"body": body},
        timeout=30,
    )
    response.raise_for_status()


def main() -> int:
    event_path = os.getenv("GITHUB_EVENT_PATH")
    repo = os.getenv("GITHUB_REPOSITORY")
    token = os.getenv("GITHUB_TOKEN")
    event_name = os.getenv("GITHUB_EVENT_NAME", "issues")
    if not event_path or not repo:
        print("GITHUB_EVENT_PATH and GITHUB_REPOSITORY are required")
        return 1

    with open(event_path, encoding="utf-8") as handle:
        event = json.load(handle)

    issue = event.get("issue", {})
    issue_number = int(issue.get("number", 0) or 0)
    body = issue.get("body") or ""
    labels = {str(x.get("name", "")).lower() for x in issue.get("labels", [])}
    title = issue.get("title", "Untitled incident")

    is_incident = (
        "incident" in labels
        or title.lower().startswith("[incident]")
        or "### service" in body.lower()
    )
    if not is_incident:
        print("Issue does not look like an incident; skipping autonomous workflow.")
        return 0

    approval_granted = False
    if event_name == "issue_comment":
        comment = event.get("comment", {})
        command = (comment.get("body") or "").strip().lower()
        actor = str(comment.get("user", {}).get("login", ""))
        association = str(comment.get("author_association", "")).upper()
        repo_owner = repo.split("/", 1)[0].lower()
        authorized = association in {"OWNER", "MEMBER", "COLLABORATOR"} or actor.lower() == repo_owner
        if not authorized:
            print(f"Ignoring approval command from unauthorized actor: {actor}")
            return 0
        if command.startswith("/reject"):
            rendered = (
                "## 🛑 AutonomousOps approval rejected\n"
                f"**Approved by:** no — rejected by `@{actor}`\n\n"
                "No mutating remediation was executed. The incident remains escalated for human handling."
            )
            if token and issue_number:
                post_comment(repo, issue_number, token, rendered)
            else:
                print(rendered)
            return 0
        if not command.startswith("/approve"):
            print("Comment is not an approval command; skipping.")
            return 0
        approval_granted = True

    service = field(body, "Service", "generic-service").splitlines()[0].strip()
    environment = field(body, "Environment", "production").splitlines()[0].strip().lower()
    impact = field(body, "Customer impact", body[:240] or "Impact not specified")
    description = field(body, "What happened?", body or title)
    recent_raw = field(body, "Recent change or deployment?", "")

    incident = Incident(
        incident_id=f"GH-{issue.get('number', 'UNKNOWN')}",
        title=title.replace("[INCIDENT]", "").replace("[incident]", "").strip(),
        description=description,
        service=service,
        environment=environment,
        customer_impact=impact,
        recent_change=parse_bool(recent_raw) or any(x in body.lower() for x in ["deploy", "release", "change"]),
        source="github-issue-approval" if approval_granted else "github-issue",
        reporter=str(issue.get("user", {}).get("login", "github-user")),
    )
    result = IncidentOrchestrator().process(incident, approval_granted=approval_granted)

    heading = "## ✅ AutonomousOps approved remediation" if approval_granted else "## 🤖 AutonomousOps incident orchestration"
    comment = [
        heading,
        f"**Trace:** `{result.trace_id}`  ",
        f"**Severity:** {result.severity}  ",
        f"**SLA target:** {result.sla_minutes} minutes  ",
        f"**Runbook:** `{result.runbook}`  ",
        f"**Workflow status:** `{result.status}`  ",
        f"**Proposed action:** {result.auto_action}  ",
        f"**Reasoning mode:** `{result.llm_mode}`",
        "",
        "### Root-cause hypotheses",
    ] + [f"- {x}" for x in result.root_cause_hypotheses] + [
        "",
        "### Tool execution trace",
    ] + [f"- **{t.tool}** — `{t.status}` — {t.message}" for t in result.tool_executions] + [
        "",
        "### Governance evidence",
    ] + [f"- {x}" for x in result.evidence] + [
        "",
        "### Stakeholder update",
        result.stakeholder_message,
        "",
        "> Portfolio-safe automation: infrastructure mutations are simulated; approval gates are enforced.",
    ]
    if not approval_granted and result.status == "WAITING_FOR_APPROVAL":
        comment += [
            "",
            "### Human decision",
            "Repository owners/collaborators can comment `/approve` to resume the governed simulation or `/reject` to stop it.",
        ]

    rendered = "\n".join(comment)
    if token and issue_number:
        post_comment(repo, issue_number, token, rendered)
        print("Posted AutonomousOps orchestration comment.")
    else:
        print(rendered)
    return 0


if __name__ == "__main__":
    sys.exit(main())
