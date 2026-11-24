from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

Label = Literal["EXTRACTED", "AI-INFERRED", "MANUAL"]
QuestionType = Literal["mcq", "assertion_reason", "numeric"]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Block(BaseModel):
    """One line/paragraph from the extractor (Docling, python-docx or pdfplumber)."""

    text: str
    index: int = 0
    page: Optional[int] = None
    bbox: Optional[list[float]] = None  # [x0, y0, x1, y1] in page points
    style: Optional[str] = None  # e.g. "Heading 1"


class SourceRegion(CamelModel):
    page: Optional[int] = None
    bbox: Optional[list[float]] = None
    block_start: int
    block_end: int


class Flag(CamelModel):
    code: str
    message: str
    severity: Literal["error", "warning"] = "error"


class OptionDraft(CamelModel):
    label: str  # normalised to upper-case A, B, C...
    text: str
    marker: str = ""  # original marker, e.g. "(a)"
    label_source: Label = "EXTRACTED"


class QuestionDraft(CamelModel):
    number: int
    section: Optional[str] = None
    type: QuestionType = "mcq"
    stem: str
    options: list[OptionDraft] = Field(default_factory=list)
    answer: Optional[str] = None
    confidence: float = 1.0
    label: Label = "EXTRACTED"
    flags: list[Flag] = Field(default_factory=list)
    source: SourceRegion


class ParseResult(CamelModel):
    filename: str = ""
    sections: list[str] = Field(default_factory=list)
    questions: list[QuestionDraft] = Field(default_factory=list)
    answer_key: dict[str, str] = Field(default_factory=dict)
    ai_pass_applied: bool = False
    stats: dict[str, int] = Field(default_factory=dict)
