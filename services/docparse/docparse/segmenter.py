"""Deterministic rule-based paper segmenter.

Input: ordered text blocks. Output: question drafts with confidence, flags,
source region and an EXTRACTED label. No AI is used here.
"""
from __future__ import annotations

import re
from typing import Iterable, Optional

from .models import Block, Flag, OptionDraft, QuestionDraft, SourceRegion

# "1." "1)" "Q1." "Q.1" "Q 1:" "Question 1."
QUESTION_RE = re.compile(
    r"^\s*(?:(?:Q(?:uestion)?\s*\.?\s*)(\d{1,3})\s*[.):\-]?|(\d{1,3})\s*[.)])\s*(.*)$", re.I
)
# "(A)" "(a)" "A)" "a." "(1)".."(5)"
OPTION_RE = re.compile(r"^\s*(\(\s*([A-Ea-e1-5])\s*\)|([A-Ea-e])\s*[.)])\s*(.*)$")
INLINE_OPTION_SPLIT_RE = re.compile(r"(?=(?:^|\s)\(\s*[A-Ea-e1-5]\s*\)\s)")
SECTION_RE = re.compile(
    r"^\s*(?:section|part)\s+[A-Za-z0-9IVX]+\b.*$|^\s*(?:physics|chemistry|mathematics|maths|biology|"
    r"english|general\s+(?:test|knowledge|aptitude)|logical\s+reasoning)\s*(?:[-:(].*)?$",
    re.I,
)
ANSWER_KEY_HEADING_RE = re.compile(r"^\s*(?:answer\s*key|answers?)\s*:?\s*$", re.I)
ASSERTION_RE = re.compile(r"^\s*assertion\b", re.I)
ANSWER_PAIR_RE = re.compile(
    r"(?:Q\.?\s*)?(\d{1,3})\s*[.):\-=]?\s*\(?\s*([A-Ea-e1-5])\s*\)?(?=\s|[,;]|$)"
)

_NUM_TO_LETTER = {"1": "A", "2": "B", "3": "C", "4": "D", "5": "E"}

CONF_FLAG_THRESHOLD = 0.7


def _norm_label(raw: str) -> str:
    raw = raw.strip()
    return _NUM_TO_LETTER.get(raw, raw.upper())


def _split_inline_options(text: str) -> list[str]:
    """'(A) x (B) y' on one line becomes separate lines."""
    if len(re.findall(r"\(\s*[A-Ea-e1-5]\s*\)", text)) < 2:
        return [text]
    parts = [p.strip() for p in INLINE_OPTION_SPLIT_RE.split(text) if p.strip()]
    return parts or [text]


class _Builder:
    def __init__(self, number: int, section: Optional[str], first: str, block: Block):
        self.number = number
        self.section = section
        self.stem_lines: list[str] = [first] if first else []
        self.options: list[OptionDraft] = []
        self.block_start = block.index
        self.block_end = block.index
        self.page = block.page
        self.bbox = list(block.bbox) if block.bbox else None
        self.warnings: list[str] = []

    def touch(self, block: Block) -> None:
        self.block_end = block.index
        if block.bbox and self.bbox and block.page == self.page:
            self.bbox = [
                min(self.bbox[0], block.bbox[0]),
                min(self.bbox[1], block.bbox[1]),
                max(self.bbox[2], block.bbox[2]),
                max(self.bbox[3], block.bbox[3]),
            ]

    def next_expected(self) -> str:
        return chr(ord("A") + len(self.options))

    def build(self) -> QuestionDraft:
        stem = " ".join(s for s in self.stem_lines if s).strip()
        flags: list[Flag] = []
        conf = 1.0
        qtype = "mcq"
        if ASSERTION_RE.match(stem) and re.search(r"\breason\b", stem, re.I):
            qtype = "assertion_reason"
        n = len(self.options)
        if len(stem) < 3:
            conf -= 0.4
            flags.append(Flag(code="EMPTY_STEM", message="Question text is empty or too short"))
        if n == 0:
            qtype = qtype if qtype == "assertion_reason" else "numeric"
            conf -= 0.35
            flags.append(
                Flag(
                    code="NO_OPTIONS",
                    message="No options detected; confirm this is a numeric/typed-answer question",
                )
            )
        elif n < 4:
            conf -= 0.25
            flags.append(Flag(code="FEW_OPTIONS", message=f"Only {n} option(s) detected"))
        if any(not o.text.strip() for o in self.options):
            conf -= 0.2
            flags.append(Flag(code="EMPTY_OPTION", message="An option has no text"))
        for w in self.warnings:
            conf -= 0.15
            flags.append(Flag(code="MARKER_ORDER", message=w, severity="warning"))
        conf = max(0.0, round(conf, 2))
        if conf < CONF_FLAG_THRESHOLD and not flags:
            flags.append(Flag(code="LOW_CONFIDENCE", message="Low confidence parse"))
        return QuestionDraft(
            number=self.number,
            section=self.section,
            type=qtype,
            stem=stem,
            options=self.options,
            confidence=conf,
            label="EXTRACTED",
            flags=flags,
            source=SourceRegion(
                page=self.page, bbox=self.bbox, block_start=self.block_start, block_end=self.block_end
            ),
        )


def parse_answer_key(text: str) -> dict[str, str]:
    """Parse '1-A, 2-B', '1. (c)', 'Q3: D' pairs into {'1': 'A', ...}."""
    out: dict[str, str] = {}
    for num, ans in ANSWER_PAIR_RE.findall(text):
        out.setdefault(str(int(num)), _norm_label(ans))
    return out


def segment(blocks: Iterable[Block]) -> tuple[list[QuestionDraft], list[str], dict[str, str]]:
    questions: list[QuestionDraft] = []
    sections: list[str] = []
    key: dict[str, str] = {}
    section: Optional[str] = None
    cur: Optional[_Builder] = None
    in_key = False

    def close() -> None:
        nonlocal cur
        if cur is not None:
            questions.append(cur.build())
            cur = None

    for block in blocks:
        raw = block.text.replace(" ", " ").strip()
        if not raw:
            continue
        is_heading_style = bool(block.style and block.style.lower().startswith(("heading", "title")))

        if ANSWER_KEY_HEADING_RE.match(raw):
            close()
            in_key = True
            continue
        if in_key:
            for k, v in parse_answer_key(raw).items():
                key.setdefault(k, v)
            continue

        if (SECTION_RE.match(raw) or is_heading_style) and not QUESTION_RE.match(raw):
            if len(raw) <= 80:
                close()
                section = raw
                sections.append(raw)
                continue

        for line in _split_inline_options(raw):
            opt = OPTION_RE.match(line)
            if opt and cur is not None:
                marker = opt.group(1)
                label = _norm_label(opt.group(2) or opt.group(3))
                if label == cur.next_expected():
                    cur.options.append(
                        OptionDraft(label=label, text=opt.group(4).strip(), marker=marker.strip())
                    )
                    cur.touch(block)
                    continue
                # out-of-order marker: keep as text, warn
                cur.warnings.append(
                    f"Unexpected option marker {marker.strip()}, expected {cur.next_expected()}"
                )
            q = QUESTION_RE.match(line)
            if q and not (opt and cur is not None):
                num = int(q.group(1) or q.group(2))
                close()
                cur = _Builder(num, section, (q.group(3) or "").strip(), block)
                continue
            if cur is None:
                continue  # preamble / instructions
            cur.touch(block)
            if cur.options:
                last = cur.options[-1]
                last.text = f"{last.text} {line}".strip()
            else:
                cur.stem_lines.append(line)
    close()
    _check_numbering(questions)
    return questions, sections, key


def _check_numbering(questions: list[QuestionDraft]) -> None:
    seen: dict[int, int] = {}
    prev: Optional[int] = None
    for q in questions:
        seen[q.number] = seen.get(q.number, 0) + 1
        if seen[q.number] > 1:
            _penalise(q, "DUPLICATE_NUMBER", f"Question number {q.number} appears more than once")
        elif prev is not None and q.number > prev + 1:
            _penalise(
                q,
                "NUMBER_GAP",
                f"Numbering jumps from {prev} to {q.number}; a question may be missing",
                severity="warning",
            )
        prev = q.number


def _penalise(q: QuestionDraft, code: str, msg: str, severity: str = "error") -> None:
    q.flags.append(Flag(code=code, message=msg, severity=severity))  # type: ignore[arg-type]
    q.confidence = max(0.0, round(q.confidence - 0.2, 2))
