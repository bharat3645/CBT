import io
import os

os.environ["DOCPARSE_USE_DOCLING"] = "false"

import docx
import pytest


@pytest.fixture
def make_docx():
    def _make(items):
        """items: list of str or (str, style)."""
        d = docx.Document()
        for it in items:
            text, style = (it, None) if isinstance(it, str) else it
            if style and style.startswith("Heading"):
                d.add_heading(text, level=int(style.split()[-1]))
            else:
                d.add_paragraph(text)
        buf = io.BytesIO()
        d.save(buf)
        return buf.getvalue()

    return _make
