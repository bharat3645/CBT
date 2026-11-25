"""OMML -> LaTeX: unit tests on programmatically built equations, plus a DOCX end-to-end through the segmenter."""
import io

import docx
from docx.oxml import parse_xml

from docparse.main import parse_bytes
from docparse.omml import M, omath_to_latex, paragraph_text

NS = f'xmlns:m="{M}" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'


def r(text, extra=""):
    return f"<m:r>{extra}<m:t>{text}</m:t></m:r>"


def e(inner, tag="m:e"):
    return f"<{tag}>{inner}</{tag}>"


def tex(inner):
    return omath_to_latex(parse_xml(f"<m:oMath {NS}>{inner}</m:oMath>"))


def test_fraction():
    assert tex(f"<m:f>{e(r('a+b'), 'm:num')}{e(r('2'), 'm:den')}</m:f>") == r"\frac{a+b}{2}"


def test_fraction_linear_and_nobar():
    assert tex(f'<m:f><m:fPr><m:type m:val="lin"/></m:fPr>{e(r("a"), "m:num")}{e(r("b"), "m:den")}</m:f>') == "a/b"
    assert tex(f'<m:f><m:fPr><m:type m:val="noBar"/></m:fPr>{e(r("n"), "m:num")}{e(r("k"), "m:den")}</m:f>') == r"\binom{n}{k}"


def test_scripts():
    assert tex(f"<m:sSup>{e(r('x'))}{e(r('2'), 'm:sup')}</m:sSup>") == "x^{2}"
    assert tex(f"<m:sSub>{e(r('a'))}{e(r('n'), 'm:sub')}</m:sSub>") == "a_{n}"
    assert tex(f"<m:sSubSup>{e(r('x'))}{e(r('i'), 'm:sub')}{e(r('2'), 'm:sup')}</m:sSubSup>") == "x_{i}^{2}"


def test_root_and_nth_root():
    assert tex(f'<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr>{e("", "m:deg")}{e(r("x+1"))}</m:rad>') == r"\sqrt{x+1}"
    assert tex(f"<m:rad>{e(r('3'), 'm:deg')}{e(r('x'))}</m:rad>") == r"\sqrt[3]{x}"


def test_integral_with_limits():
    x = (f'<m:nary><m:naryPr><m:chr m:val="∫"/></m:naryPr>{e(r("0"), "m:sub")}{e(r("1"), "m:sup")}'
         f"{e(r('x') + r('dx'))}</m:nary>")
    assert tex(x) == r"\int_{0}^{1} xdx"


def test_summation_and_greek():
    x = (f'<m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr>{e(r("i=1"), "m:sub")}{e(r("n"), "m:sup")}'
         f"{e(r('α') + r('+') + r('β'))}</m:nary>")
    assert tex(x) == r"\sum_{i=1}^{n} \alpha +\beta"


def test_greek_and_operators_in_runs():
    assert tex(r("θ±π×Δ≤∞")) == r"\theta \pm \pi \times \Delta \le \infty"


def test_delimiters_default_and_custom():
    assert tex(f"<m:d>{e(r('a+b'))}</m:d>") == r"\left(a+b \right)"
    x = f'<m:d><m:dPr><m:begChr m:val="|"/><m:endChr m:val="|"/></m:dPr>{e(r("x"))}</m:d>'
    assert tex(x) == r"\left|x \right|"
    x = f'<m:d><m:dPr><m:begChr m:val="{{"/><m:endChr m:val=""/></m:dPr>{e(r("x"))}{e(r("y"))}</m:d>'
    assert tex(x) == r"\left\{x | y \right."


def test_function_and_limit():
    assert tex(f"<m:func>{e(r('sin'), 'm:fName')}{e(r('θ'))}</m:func>") == r"\sin \theta"
    x = (f"<m:func>{e('<m:limLow>' + e(r('lim')) + e(r('x→0'), 'm:lim') + '</m:limLow>', 'm:fName')}"
         f"{e(r('x'))}</m:func>")
    assert tex(x) == r"\lim_{x\to 0} x"


def test_accent_and_bar():
    assert tex(f'<m:acc><m:accPr><m:chr m:val="⃗"/></m:accPr>{e(r("v"))}</m:acc>') == r"\vec{v}"
    assert tex(f"<m:acc>{e(r('x'))}</m:acc>") == r"\hat{x}"
    assert tex(f"<m:bar>{e(r('AB'))}</m:bar>") == r"\overline{AB}"


def test_matrix_and_eqarr():
    row = lambda a, b: f"<m:mr>{e(r(a))}{e(r(b))}</m:mr>"  # noqa: E731
    m = f"<m:m>{row('a', 'b')}{row('c', 'd')}</m:m>"
    assert tex(f'<m:d>{e(m)}</m:d>') == r"\left(\begin{matrix}a & b \\ c & d\end{matrix} \right)"
    assert tex(f"<m:eqArr>{e(r('x=1'))}{e(r('y=2'))}</m:eqArr>") == r"\begin{aligned}x=1 \\ y=2\end{aligned}"


def test_nested():
    inner = f"<m:sSup>{e(r('x'))}{e(r('2'), 'm:sup')}</m:sSup>"
    x = f"<m:f>{e(inner + r('+1'), 'm:num')}{e('<m:rad>' + e('', 'm:deg') + e(r('y')) + '</m:rad>', 'm:den')}</m:f>"
    assert tex(x) == r"\frac{x^{2}+1}{\sqrt{y}}"


def test_special_chars_escaped():
    assert tex(r("50%")) == r"50\%"


def test_paragraph_inline_and_display():
    p = parse_xml(
        f"<w:p {NS}><w:r><w:t xml:space='preserve'>Value of </w:t></w:r>"
        f"<m:oMath>{r('x')}</m:oMath><w:r><w:t xml:space='preserve'> is</w:t></w:r></w:p>"
    )
    assert paragraph_text(p) == "Value of $x$ is"
    p = parse_xml(f"<w:p {NS}><m:oMathPara><m:oMath>{r('E=mc')}</m:oMath></m:oMathPara></w:p>")
    assert paragraph_text(p) == r"$\displaystyle E=mc$"


def _docx_bytes(build):
    d = docx.Document()
    build(d)
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def _para_with_math(d, before, omath, after="", cell=None):
    target = cell if cell is not None else d
    p = target.add_paragraph(before)
    p._p.append(parse_xml(f"<m:oMath {NS}>{omath}</m:oMath>"))
    if after:
        p.add_run(after)
    return p


def test_docx_end_to_end_segmenter_options_and_key():
    frac = f"<m:f>{e(r('1'), 'm:num')}{e(r('2'), 'm:den')}</m:f>"
    sq = f"<m:sSup>{e(r('x'))}{e(r('2'), 'm:sup')}</m:sSup>"
    integ = (f'<m:nary><m:naryPr><m:chr m:val="∫"/></m:naryPr>{e(r("0"), "m:sub")}{e(r("1"), "m:sup")}'
             f"{e(r('x'))}</m:nary>")

    def build(d):
        _para_with_math(d, "1. The value of ", integ, " dx is")
        for letter, om in zip("ABCD", [frac, sq, r("π"), r("0")]):
            _para_with_math(d, f"({letter}) ", om)
        d.add_paragraph("2. Plain question?")
        for letter in "ABCD":
            d.add_paragraph(f"({letter}) opt {letter}")
        d.add_heading("Answer Key", level=2)
        d.add_paragraph("1-A, 2-B")

    res = parse_bytes("m.docx", _docx_bytes(build))
    q1 = res.questions[0]
    assert q1.stem.endswith(r"$\int_{0}^{1} x$ dx is")
    assert [o.text for o in q1.options] == [r"$\frac{1}{2}$", "$x^{2}$", r"$\pi$", "$0$"]
    assert len(res.questions) == 2 and res.answer_key == {"1": "A", "2": "B"}
    assert res.questions[0].answer == "A"


def test_docx_equation_in_table_cell_and_run_order():
    def build(d):
        d.add_paragraph("1. Match the following")
        t = d.add_table(rows=1, cols=1)
        _para_with_math(d, "", f"<m:sSub>{e(r('a'))}{e(r('n'), 'm:sub')}</m:sSub>", cell=t.cell(0, 0))
        for letter in "AB":
            d.add_paragraph(f"({letter}) o{letter}")

    res = parse_bytes("t.docx", _docx_bytes(build))
    assert "$a_{n}$" in res.questions[0].stem
