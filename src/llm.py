"""Optional generative-reasoning layer.

The portfolio is fully runnable without an API key. When an OpenAI-compatible key is
configured, specialist agents can enrich deterministic operational decisions with a
short, structured root-cause hypothesis. Deterministic policy remains authoritative for
severity, approvals and tool execution so model output cannot bypass governance.
"""
from __future__ import annotations

import json
import os
from typing import List, Optional


class LLMReasoner:
    def __init__(self) -> None:
        self.api_key = os.getenv("OPENAI_API_KEY")
        self.model = os.getenv("OPENAI_MODEL", "gpt-5-mini")
        self._client = None
        if self.api_key:
            try:
                from openai import OpenAI

                self._client = OpenAI(api_key=self.api_key)
            except Exception:
                self._client = None

    @property
    def enabled(self) -> bool:
        return self._client is not None

    @property
    def mode(self) -> str:
        return f"generative:{self.model}" if self.enabled else "deterministic-fallback"

    def root_cause_hypotheses(
        self,
        *,
        incident_text: str,
        runbook_name: str,
        runbook_steps: List[str],
    ) -> Optional[List[str]]:
        if not self.enabled:
            return None

        system = (
            "You are an SRE incident-analysis assistant. Return only JSON with key "
            "hypotheses containing 1-3 concise hypotheses. Do not claim certainty. "
            "Use only the supplied incident and runbook context."
        )
        user = json.dumps(
            {
                "incident": incident_text,
                "runbook": runbook_name,
                "runbook_steps": runbook_steps,
            }
        )
        try:
            response = self._client.chat.completions.create(
                model=self.model,
                temperature=0.1,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            )
            content = response.choices[0].message.content or "{}"
            parsed = json.loads(content)
            values = parsed.get("hypotheses") or []
            return [str(x).strip() for x in values if str(x).strip()][:3]
        except Exception:
            return None
