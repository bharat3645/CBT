from docparse.extract import extract_docx
from docparse.main import parse_bytes
from docparse.models import Block
from docparse.segmenter import parse_answer_key, segment


def blocks(*lines):
    return [Block(text=t, index=i) for i, t in enumerate(lines)]


def test_basic_mcq_upper_paren():
    qs, _, _ = segment(blocks("1. What is 2+2?", "(A) 3", "(B) 4", "(C) 5", "(D) 6"))
    assert len(qs) == 1
    q = qs[0]
    assert q.number == 1 and q.type == "mcq" and q.stem == "What is 2+2?"
    assert [o.label for o in q.options] == list("ABCD")
    assert q.confidence == 1.0 and q.flags == [] and q.label == "EXTRACTED"


def test_lowercase_marker_styles_normalised():
    qs, _, _ = segment(
        blocks("1) Q one", "a) x", "b) y", "c) z", "d) w", "2) Q two", "a. p", "b. q", "c. r", "d. s")
    )
    assert [q.number for q in qs] == [1, 2]
    assert [o.label for o in qs[0].options] == list("ABCD")
    assert [o.label for o in qs[1].options] == list("ABCD")


def test_numeric_option_markers():
    qs, _, _ = segment(blocks("1. Pick", "(1) a", "(2) b", "(3) c", "(4) d"))
    assert [o.label for o in qs[0].options] == list("ABCD")


def test_inline_options_split():
    qs, _, _ = segment(blocks("1. Pick one", "(A) red (B) green (C) blue (D) pink"))
    assert [o.text for o in qs[0].options] == ["red", "green", "blue", "pink"]


def test_multiline_stem_and_option_continuation():
    qs, _, _ = segment(blocks("1. First line", "second line", "(A) alpha", "beta", "(B) b", "(C) c", "(D) d"))
    assert qs[0].stem == "First line second line"
    assert qs[0].options[0].text == "alpha beta"


def test_q_prefix_variants():
    qs, _, _ = segment(blocks("Q1. a", "(A) x", "(B) y", "(C) z", "(D) w", "Q.2 b", "Q 3: c"))
    assert [q.number for q in qs] == [1, 2, 3]


def test_section_headings_assigned():
    qs, secs, _ = segment(
        blocks("Section A: Physics", "1. q", "(A) a", "(B) b", "(C) c", "(D) d", "Section B: Chemistry",
               "2. q2", "(A) a", "(B) b", "(C) c", "(D) d")
    )
    assert secs == ["Section A: Physics", "Section B: Chemistry"]
    assert qs[0].section == "Section A: Physics" and qs[1].section == "Section B: Chemistry"


def test_heading_style_is_section():
    bl = [Block(text="Mathematics", index=0, style="Heading 1"), Block(text="1. q", index=1)]
    qs, secs, _ = segment(bl)
    assert secs == ["Mathematics"] and qs[0].section == "Mathematics"


def test_assertion_reason_type():
    qs, _, _ = segment(
        blocks("5. Assertion (A): The sky is blue.", "Reason (R): Rayleigh scattering.",
               "(A) Both true, R explains A", "(B) Both true, R does not explain A",
               "(C) A true, R false", "(D) A false, R true")
    )
    assert qs[0].type == "assertion_reason"
    assert "Reason (R)" in qs[0].stem and len(qs[0].options) == 4


def test_no_options_flagged_numeric():
    qs, _, _ = segment(blocks("1. Find the value of x."))
    q = qs[0]
    assert q.type == "numeric" and q.confidence < 0.7
    assert any(f.code == "NO_OPTIONS" for f in q.flags)


def test_few_options_flagged():
    qs, _, _ = segment(blocks("1. question", "(A) a", "(B) b"))
    assert any(f.code == "FEW_OPTIONS" for f in qs[0].flags)
    assert qs[0].confidence == 0.75


def test_duplicate_and_gap_numbers():
    opts = ["(A) 1", "(B) 2", "(C) 3", "(D) 4"]
    qs, _, _ = segment(blocks("1. a", *opts, "1. b", *opts, "4. c", *opts))
    assert any(f.code == "DUPLICATE_NUMBER" for f in qs[1].flags)
    assert any(f.code == "NUMBER_GAP" for f in qs[2].flags)


def test_out_of_order_marker_warns_not_new_option():
    qs, _, _ = segment(blocks("1. q", "(A) a", "(C) c", "(B) b"))
    assert any(f.code == "MARKER_ORDER" for f in qs[0].flags)


def test_preamble_ignored():
    qs, _, _ = segment(
        blocks("Instructions: read carefully", "Time: 3 hours", "1. q", "(A) a", "(B) b", "(C) c", "(D) d")
    )
    assert len(qs) == 1


def test_source_region_block_range_and_bbox():
    bl = [
        Block(text="1. q", index=0, page=2, bbox=[10, 10, 100, 20]),
        Block(text="(A) a", index=1, page=2, bbox=[10, 25, 80, 35]),
        Block(text="(B) b", index=2, page=2, bbox=[10, 40, 80, 50]),
    ]
    q = segment(bl)[0][0]
    assert q.source.page == 2 and q.source.bbox == [10, 10, 100, 50]
    assert (q.source.block_start, q.source.block_end) == (0, 2)


def test_answer_key_parsing_variants():
    assert parse_answer_key("1-A, 2-B; 3. (c) Q4: D 5=a") == {
        "1": "A", "2": "B", "3": "C", "4": "D", "5": "A"
    }
    assert parse_answer_key("1. 2  2. 4") == {"1": "B", "2": "D"}


def test_answer_key_section():
    qs, _, key = segment(blocks("1. q", "(A) a", "(B) b", "(C) c", "(D) d", "Answer Key", "1-B", "2-C"))
    assert key == {"1": "B", "2": "C"} and len(qs) == 1


def test_docx_end_to_end(make_docx):
    data = make_docx([
        ("Physics", "Heading 1"),
        "1. Unit of force?", "(A) Joule", "(B) Newton", "(C) Watt", "(D) Pascal",
        "2. Assertion: A", "Reason: R", "(A) a", "(B) b", "(C) c", "(D) d",
        ("Chemistry", "Heading 1"),
        "3. Atomic number of H?",
        "Answer Key", "1-B, 2-A",
    ])
    assert len(extract_docx(data)) > 10
    res = parse_bytes("p.docx", data)
    assert res.sections == ["Physics", "Chemistry"]
    assert [q.number for q in res.questions] == [1, 2, 3]
    assert res.questions[0].answer == "B" and res.questions[1].type == "assertion_reason"
    assert res.questions[2].type == "numeric" and res.stats["flagged"] == 1
    assert res.answer_key == {"1": "B", "2": "A"}


def test_ai_pass_disabled_by_default(make_docx):
    res = parse_bytes("p.docx", make_docx(["1. q"]))
    assert res.ai_pass_applied is False and res.questions[0].label == "EXTRACTED"
