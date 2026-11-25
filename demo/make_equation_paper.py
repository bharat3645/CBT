"""Generates demo/equation-paper.docx: a mock paper whose maths are REAL Word equation objects (OMML),
not typed $...$. Exercises docparse's native OMML -> LaTeX path (no Docling needed).

Run: python demo/make_equation_paper.py   (needs python-docx)
"""
from docx import Document
from docx.oxml import parse_xml

M = "http://schemas.openxmlformats.org/officeDocument/2006/math"
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = f'xmlns:m="{M}" xmlns:w="{W}"'


def r(t):
    return f"<m:r><m:t>{t}</m:t></m:r>"


def e(x, tag="m:e"):
    return f"<{tag}>{x}</{tag}>"


def frac(n, d):
    return f"<m:f>{e(n, 'm:num')}{e(d, 'm:den')}</m:f>"


def sup(b, s):
    return f"<m:sSup>{e(b)}{e(s, 'm:sup')}</m:sSup>"


def sub(b, s):
    return f"<m:sSub>{e(b)}{e(s, 'm:sub')}</m:sSub>"


def sqrt(x, deg=None):
    d = e(deg, "m:deg") if deg else '<m:deg/>'
    pr = "" if deg else '<m:radPr><m:degHide m:val="1"/></m:radPr>'
    return f"<m:rad>{pr}{d}{e(x)}</m:rad>"


def nary(ch, lo, hi, body):
    return f'<m:nary><m:naryPr><m:chr m:val="{ch}"/></m:naryPr>{e(lo, "m:sub")}{e(hi, "m:sup")}{e(body)}</m:nary>'


def paren(x):
    return f"<m:d>{e(x)}</m:d>"


def vec(x):
    return f'<m:acc><m:accPr><m:chr m:val="⃗"/></m:accPr>{e(x)}</m:acc>'


def matrix(rows):
    mr = "".join("<m:mr>" + "".join(e(c) for c in row) + "</m:mr>" for row in rows)
    return f"<m:d>{e('<m:m>' + mr + '</m:m>')}</m:d>"


d = Document()
d.add_heading("Equation Mock Test (Word equations)", level=1)
d.add_heading("Mathematics", level=2)


def question(number, before, omath, after, options):
    p = d.add_paragraph(f"{number}. {before}")
    if omath:
        p._p.append(parse_xml(f"<m:oMath {NS}>{omath}</m:oMath>"))
    if after:
        p.add_run(after)
    for letter, o in zip("ABCD", options):
        op = d.add_paragraph(f"({letter}) ")
        if o.startswith("<"):
            op._p.append(parse_xml(f"<m:oMath {NS}>{o}</m:oMath>"))
        else:
            op.add_run(o)


question(1, "The value of ", nary("∫", r("0"), r("1"), r("x") + r("dx")), " is",
         [frac(r("1"), r("2")), r("1"), r("0"), frac(r("1"), r("3"))])
question(2, "If ", r("f(x)=") + sup(r("x"), r("2")), ", then f'(3) equals", ["3", "6", "9", "2"])
question(3, "The roots of ", sup(r("x"), r("2")) + r("-5x+6=0"), " are", ["2 and 3", "1 and 6", "-2 and -3", "2 and -3"])
question(4, "Evaluate ", nary("∑", r("k=1"), r("n"), sup(r("k"), r("2"))), "",
         [frac(r("n(n+1)(2n+1)"), r("6")), frac(r("n(n+1)"), r("2")), sup(paren(frac(r("n(n+1)"), r("2"))), r("2")), r("n")])
question(5, "The solution of ", sqrt(r("x+1")) + r("=3"), " is", ["8", "9", "10", "4"])
question(6, "", sup(r("sin"), r("2")) + r("θ+") + sup(r("cos"), r("2")) + r("θ"), " equals", ["0", "1", "2", r("θ")])
question(7, "The cube root of 8 is ", sqrt(r("8"), r("3")), "", ["2", "4", "8", "1"])
question(8, "The vector ", vec(r("v")) + r("=") + matrix([[r("a")], [r("b")]]), " has magnitude",
         [sqrt(sup(r("a"), r("2")) + r("+") + sup(r("b"), r("2"))), r("a+b"), r("ab"), r("0")])
question(9, "The energy of a photon is ", r("E=hν=") + frac(r("hc"), r("λ")), ". Its unit is", ["J", "N", "W", "Pa"])
question(10, "Which equals ", sub(r("x"), r("1")) + r("+") + sub(r("x"), r("2")), " for roots of ax²+bx+c?",
         [frac(r("-b"), r("a")), frac(r("b"), r("a")), frac(r("c"), r("a")), r("0")])

d.add_heading("Answer Key", level=2)
d.add_paragraph("1-A, 2-B, 3-A, 4-A, 5-A, 6-B, 7-A, 8-A, 9-A, 10-A")
d.save("demo/equation-paper.docx")
print("wrote demo/equation-paper.docx")
