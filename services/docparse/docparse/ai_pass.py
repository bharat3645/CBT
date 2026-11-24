"""Optional AI pass for ambiguous drafts. Disabled by default (AI_PASS_ENABLED=false).

Anything it changes must be labelled AI-INFERRED. No provider is wired yet: this is a stub
so the pipeline, flag and labelling contract exist. Plug a provider into `_resolve`.
"""
from __future__ import annotations

from .models import QuestionDraft

AMBIGUOUS_BELOW = 0.7


def _resolve(q: QuestionDraft) -> QuestionDraft:  # pragma: no cover - provider hook
    return q


def run_ai_pass(questions: list[QuestionDraft], enabled: bool) -> tuple[list[QuestionDraft], bool]:
    if not enabled:
        return questions, False
    out = []
    for q in questions:
        if q.confidence < AMBIGUOUS_BELOW:
            new = _resolve(q)
            if new is not q:
                new.label = "AI-INFERRED"
            q = new
        out.append(q)
    return out, True
