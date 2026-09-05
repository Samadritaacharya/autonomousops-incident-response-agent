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
    """Read one GitHub issue-form Markdown field without spilling into the next heading."""
    target = heading.strip().casefold()
    lines = body.splitlines()
    start: int | None = None

    for index, line in enumerate(lines):
        match = re.match(r"^###\s+(.+?)\s*$", line)
        if match and match.group(1).strip().casefold() == target:
            start = index + 1
            break

    if start is None:
        return default

    collected: list[str] = []
    for line in lines[start:]:
        if re.match(r"^###\s+", line):
            break
        collected.append(line)

    value = "\n".join(collected).strip()
    return "" if value == "_No response_" else value


def first_line(value: str, default: str) -> str:
    for line in value.splitlines():
        normalized = line.strip()
        if normalized:
            return normalized
    return default


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

    try:
        with open(event_path, encoding="utf-8") as handle:
            event = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Unable to read GitHub event payload: {exc}")
        return 1

    issue = event.get("issue", {})
    if not isinstance(issue, dict):
        print("GitHub event did not include a valid issue object")
        return 1

    issue_number = int(issue.get("number", 0) or 0)
    body = str(issue.get("body") or "")
    raw_labels = issue.get("labels", [])
    labels = {
        str(item.get("name", "")).lower()
        for item in raw_labels
        if isinstance(item, dict)
    }
    title = str(issue.get("title") or "Untitled incident")

    is_incident = (
        "incident" in labels
        or title.lower().startswith("[incident]")
        or "### service" in body.lower()
    )
    if not is_incident:
        print("Issue does not look like an incident; skipping autonomous workflow.")
        return 0

    approval_granted = False
    approval_rejected = False
    actor = ""
    if event_name == "issue_comment":
        comment = event.get("comment", {})
        if not isinstance(comment, dict):
            print("Issue-comment event did not include a valid comment object")
            return 1
        command = str(comment.get("body") or "").strip().lower()
        user = comment.get("user", {})
        actor = str(user.get("login", "")) if isinstance(user, dict) else ""
        association = str(comment.get("author_association", "")).upper()
        repo_owner = repo.split("/", 1)[0].lower()
        authorized = association in {"OWNER", "MEMBER", "COLLABORATOR"} or actor.lower() == repo_owner
        if not authorized:
            print(f"Ignoring approval command from unauthorized actor: {actor}")
            return 0
        if command.startswith("/reject"):
            approval_rejected = True
        elif command.startswith("/approve"):
            approval_granted = True
        else:
            print("Comment is not an approval command; skipping.")
            return 0

    service = first_line(field(body, "Service", "generic-service"), "generic-service").lower()
    environment = first_line(field(body, "Environment", "production"), "production").lower()
    impact = field(body, "Customer impact", body[:240] or "Impact not specified").strip() or "Impact not specified"
    description = field(body, "What happened?", body or title).strip() or title
    recent_raw = field(body, "Recent change or deployment?", "")

    incident = Incident(
        incident_id=f"GH-{issue.get('number', 'UNKNOWN')}",
        title=re.sub(r"^\[incident\]\s*", "", title, flags=re.I).strip() or "Untitled incident",
        description=description,
        service=service,
        environment=environment,
        customer_impact=impact,
        recent_change=parse_bool(recent_raw) or any(x in body.lower() for x in ["deploy", "release", "change"]),
        source=(
            "github-issue-rejection"
            if approval_rejected
            else "github-issue-approval"
            if approval_granted
            else "github-issue"
        ),
        reporter=str(issue.get("user", {}).get("login", "github-user")) if isinstance(issue.get("user", {}), dict) else "github-user",
    )
    result = IncidentOrchestrator().process(
        incident,
        approval_granted=approval_granted,
        approval_rejected=approval_rejected,
    )

    if approval_rejected:
        heading = "## 🛑 AutonomousOps remediation rejected"
    elif approval_granted:
        heading = "## ✅ AutonomousOps approved remediation"
    else:
        heading = "## 🤖 AutonomousOps incident orchestration"

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

    if approval_rejected:
        comment += [
            "",
            "### Human decision",
            f"Rejected by `@{actor or 'authorized-operator'}`. No mutating remediation was executed.",
        ]
    elif not approval_granted and result.status == "WAITING_FOR_APPROVAL":
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
