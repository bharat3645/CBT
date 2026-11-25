"""Extractors turn a file into ordered Blocks. Docling is preferred when installed."""
from __future__ import annotations

import io
from typing import Optional

from .models import Block


def _iter_paragraph_elements(parent):
    """Yield w:p elements in document order, descending into tables and content controls."""
    from .omml import W

    for ch in parent:
        tag = ch.tag if isinstance(ch.tag, str) else ""
        if not tag.startswith("{" + W + "}"):
            continue
        local = tag.rpartition("}")[2]
        if local == "p":
            yield ch
        elif local in ("tbl", "tr", "tc", "sdt", "sdtContent"):
            yield from _iter_paragraph_elements(ch)


def extract_docx(data: bytes) -> list[Block]:
    """python-docx extraction. Word equations (OMML) become inline $LaTeX$ in reading order."""
    import docx  # python-docx
    from docx.text.paragraph import Paragraph

    from .omml import paragraph_text

    document = docx.Document(io.BytesIO(data))
    blocks: list[Block] = []
    for p_el in _iter_paragraph_elements(document.element.body):
        text = paragraph_text(p_el)
        if not text.strip():
            continue
        try:
            style = Paragraph(p_el, document).style.name
        except Exception:
            style = None
        for line in text.split("\n"):
            if line.strip():
                blocks.append(Block(text=line, index=len(blocks), style=style))
    return blocks


def extract_pdf(data: bytes) -> list[Block]:
    import pdfplumber

    blocks: list[Block] = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for pno, page in enumerate(pdf.pages, start=1):
            for line in page.extract_text_lines():
                blocks.append(
                    Block(
                        text=line["text"],
                        index=len(blocks),
                        page=pno,
                        bbox=[line["x0"], line["top"], line["x1"], line["bottom"]],
                    )
                )
    return blocks


def extract_docling(data: bytes, suffix: str) -> Optional[list[Block]]:
    """Richer extraction (tables, equations as LaTeX). Returns None if Docling is absent."""
    try:
        from docling.datamodel.base_models import DocumentStream
        from docling.document_converter import DocumentConverter
    except ImportError:
        return None
    result = DocumentConverter().convert(DocumentStream(name=f"paper{suffix}", stream=io.BytesIO(data)))
    blocks: list[Block] = []
    for item, _level in result.document.iterate_items():
        text = getattr(item, "text", None)
        if not text or not text.strip():
            continue
        page = bbox = None
        prov = getattr(item, "prov", None)
        if prov:
            page = prov[0].page_no
            b = prov[0].bbox
            bbox = [b.l, b.t, b.r, b.b]
        label = str(getattr(item, "label", "") or "")
        style = "Heading" if "section_header" in label or "title" in label else None
        blocks.append(Block(text=text, index=len(blocks), page=page, bbox=bbox, style=style))
    return blocks


def extract(filename: str, data: bytes, use_docling: bool = True) -> list[Block]:
    name = filename.lower()
    if not name.endswith((".pdf", ".docx")):
        raise ValueError("Unsupported file type; expected .docx or .pdf")
    suffix = ".pdf" if name.endswith(".pdf") else ".docx"
    if use_docling:
        got = extract_docling(data, suffix)
        if got:
            return got
    return extract_pdf(data) if suffix == ".pdf" else extract_docx(data)
