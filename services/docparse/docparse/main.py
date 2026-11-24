from __future__ import annotations

import os

from fastapi import FastAPI, File, HTTPException, UploadFile

from .ai_pass import run_ai_pass
from .extract import extract
from .models import ParseResult
from .segmenter import segment

MAX_BYTES = int(os.getenv("DOCPARSE_MAX_BYTES", str(50 * 1024 * 1024)))

app = FastAPI(title="docparse", version="0.1.0")


def parse_bytes(filename: str, data: bytes) -> ParseResult:
    use_docling = os.getenv("DOCPARSE_USE_DOCLING", "true").lower() == "true"
    blocks = extract(filename, data, use_docling=use_docling)
    questions, sections, key = segment(blocks)
    for q in questions:
        if str(q.number) in key:
            q.answer = key[str(q.number)]
    questions, applied = run_ai_pass(questions, os.getenv("AI_PASS_ENABLED", "false").lower() == "true")
    flagged = sum(1 for q in questions if any(f.severity == "error" for f in q.flags))
    return ParseResult(
        filename=filename,
        sections=sections,
        questions=questions,
        answer_key=key,
        ai_pass_applied=applied,
        stats={"questions": len(questions), "flagged": flagged, "blocks": len(blocks)},
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/parse")
async def parse(file: UploadFile = File(...)) -> dict:
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File too large")
    try:
        result = parse_bytes(file.filename or "paper.docx", data)
    except ValueError as e:
        raise HTTPException(415, str(e)) from e
    except Exception as e:  # corrupt file
        raise HTTPException(422, f"Could not parse document: {e}") from e
    return result.model_dump(by_alias=True)
