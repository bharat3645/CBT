"""Pure-python OMML (Word equation) to LaTeX converter and paragraph text walker.

No Docling needed: works on the lxml elements python-docx already exposes.
Unknown math elements degrade gracefully (their children are converted, never dropped).
"""
from __future__ import annotations

import re

M = "http://schemas.openxmlformats.org/officeDocument/2006/math"
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def _q(ns: str, tag: str) -> str:
    return "{%s}%s" % (ns, tag)


def _local(el) -> str:
    return el.tag.rpartition("}")[2] if isinstance(el.tag, str) else ""


_TRUE = ("1", "true", "on")

# Unicode -> LaTeX.
SYMBOLS: dict[str, str] = {
    # Greek lower
    "α": r"\alpha", "β": r"\beta", "γ": r"\gamma", "δ": r"\delta", "ε": r"\epsilon", "ϵ": r"\epsilon",
    "ζ": r"\zeta", "η": r"\eta", "θ": r"\theta", "ϑ": r"\vartheta", "ι": r"\iota", "κ": r"\kappa",
    "λ": r"\lambda", "μ": r"\mu", "ν": r"\nu", "ξ": r"\xi", "π": r"\pi", "ρ": r"\rho", "σ": r"\sigma",
    "ς": r"\varsigma", "τ": r"\tau", "υ": r"\upsilon", "φ": r"\phi", "ϕ": r"\varphi", "χ": r"\chi",
    "ψ": r"\psi", "ω": r"\omega",
    # Greek upper
    "Γ": r"\Gamma", "Δ": r"\Delta", "Θ": r"\Theta", "Λ": r"\Lambda", "Ξ": r"\Xi", "Π": r"\Pi",
    "Σ": r"\Sigma", "Φ": r"\Phi", "Ψ": r"\Psi", "Ω": r"\Omega",
    # operators / relations / arrows / sets
    "×": r"\times", "÷": r"\div", "·": r"\cdot", "⋅": r"\cdot", "∙": r"\cdot", "±": r"\pm", "∓": r"\mp",
    "−": "-", "–": "-", "∗": "*", "∘": r"\circ", "∞": r"\infty", "∂": r"\partial", "∇": r"\nabla",
    "≤": r"\le", "≥": r"\ge", "≠": r"\ne", "≈": r"\approx", "≡": r"\equiv", "∝": r"\propto",
    "≪": r"\ll", "≫": r"\gg", "≅": r"\cong", "∼": r"\sim", "≃": r"\simeq",
    "→": r"\to", "←": r"\leftarrow", "↔": r"\leftrightarrow", "⇒": r"\Rightarrow", "⇐": r"\Leftarrow",
    "⇔": r"\Leftrightarrow", "↦": r"\mapsto", "↑": r"\uparrow", "↓": r"\downarrow",
    "∈": r"\in", "∉": r"\notin", "∋": r"\ni", "⊂": r"\subset", "⊃": r"\supset", "⊆": r"\subseteq",
    "⊇": r"\supseteq", "∪": r"\cup", "∩": r"\cap", "∅": r"\emptyset", "∀": r"\forall", "∃": r"\exists",
    "¬": r"\neg", "∧": r"\wedge", "∨": r"\vee", "∴": r"\therefore", "∵": r"\because",
    "∠": r"\angle", "⊥": r"\perp", "∥": r"\parallel", "°": r"^\circ", "′": "'", "″": "''",
    "…": r"\ldots", "⋯": r"\cdots", "⋮": r"\vdots", "⋱": r"\ddots", "ℏ": r"\hbar", "ℓ": r"\ell",
    "ℝ": r"\mathbb{R}", "ℕ": r"\mathbb{N}", "ℤ": r"\mathbb{Z}", "ℚ": r"\mathbb{Q}", "ℂ": r"\mathbb{C}",
    "√": r"\sqrt", "∑": r"\sum", "∏": r"\prod", "∫": r"\int", "∬": r"\iint", "∭": r"\iiint", "∮": r"\oint",
    "⁰": "^{0}", "¹": "^{1}", "²": "^{2}", "³": "^{3}", "⁴": "^{4}", "⁵": "^{5}", "⁶": "^{6}",
    "⁷": "^{7}", "⁸": "^{8}", "⁹": "^{9}", "⁻": "^{-}", "⁺": "^{+}",
    "₀": "_{0}", "₁": "_{1}", "₂": "_{2}", "₃": "_{3}", "₄": "_{4}", "₅": "_{5}", "₆": "_{6}",
    "₇": "_{7}", "₈": "_{8}", "₉": "_{9}",
    "⁡": "", "⁢": "", "⁣": "", "​": "",  # invisible function/times/separator
    " ": " ", " ": " ", " ": " ", " ": " ",
}

_SPECIAL = {"#": r"\#", "$": r"\$", "%": r"\%", "&": r"\&", "_": r"\_", "{": r"\{", "}": r"\}",
            "~": r"\textasciitilde{}", "^": r"\^{}", "\\": r"\backslash "}

KNOWN_FUNCS = {
    "sin", "cos", "tan", "cot", "sec", "csc", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh",
    "coth", "log", "ln", "lg", "exp", "lim", "max", "min", "sup", "inf", "det", "dim", "gcd", "deg",
    "ker", "arg", "Pr", "hom",
}

ACCENTS = {
    "̂": r"\hat", "^": r"\hat", "ˆ": r"\hat", "̃": r"\tilde", "~": r"\tilde",
    "˜": r"\tilde", "̄": r"\bar", "¯": r"\bar", "̅": r"\overline",
    "̇": r"\dot", "˙": r"\dot", "̈": r"\ddot", "¨": r"\ddot",
    "⃗": r"\vec", "→": r"\vec", "́": r"\acute", "´": r"\acute",
    "̀": r"\grave", "`": r"\grave", "̆": r"\breve", "̌": r"\check",
    "⃛": r"\dddot",
}

_DELIM_OPEN = {"(": "(", "[": "[", "{": r"\{", "|": "|", "‖": r"\|", "⟨": r"\langle", "〈": r"\langle",
               "⌊": r"\lfloor", "⌈": r"\lceil", "": "."}
_DELIM_CLOSE = {")": ")", "]": "]", "}": r"\}", "|": "|", "‖": r"\|", "⟩": r"\rangle", "〉": r"\rangle",
                "⌋": r"\rfloor", "⌉": r"\rceil", "": "."}

NARY_CMD = {"∑": r"\sum", "∏": r"\prod", "∐": r"\coprod", "∫": r"\int", "∬": r"\iint", "∭": r"\iiint",
            "∮": r"\oint", "⋃": r"\bigcup", "⋂": r"\bigcap", "⋁": r"\bigvee", "⋀": r"\bigwedge",
            "⨁": r"\bigoplus", "⨂": r"\bigotimes"}


def _tex_text(s: str) -> str:
    """Math text to LaTeX; a trailing space follows alphabetic commands so they can't fuse with letters."""
    out: list[str] = []
    for ch in s:
        if ch in SYMBOLS:
            v = SYMBOLS[ch]
            out.append(v + (" " if v.startswith("\\") and v[-1].isalpha() else ""))
        elif ch in _SPECIAL:
            out.append(_SPECIAL[ch])
        else:
            out.append(ch)
    return "".join(out)


def _group(s: str) -> str:
    """Base of a script: bare if a single plain char, else braced."""
    s = s.strip()
    return s if len(s) == 1 and s not in "\\{}" else "{" + s + "}"


def _g(s: str) -> str:
    return "{" + s.strip() + "}"


class OmmlConverter:
    def conv_children(self, el) -> str:
        return "".join(self.conv(c) for c in el)

    def conv(self, el) -> str:
        tag = el.tag
        if not isinstance(tag, str) or not tag.startswith("{" + M + "}"):
            return ""
        fn = getattr(self, "_" + _local(el), None)
        if fn is None:
            return self.conv_children(el)  # unknown element: keep its content
        return fn(el)

    def _sub(self, el, tag: str) -> str:
        child = el.find(_q(M, tag))
        return self.conv_children(child) if child is not None else ""

    def _prop(self, el, pr_tag: str, prop: str, default=None):
        pr = el.find(_q(M, pr_tag))
        if pr is not None:
            p = pr.find(_q(M, prop))
            if p is not None:
                v = p.get(_q(M, "val"))
                return default if v is None and prop not in ("chr",) else (v if v is not None else default)
        return default

    # ---- leaf text
    def _r(self, el) -> str:
        raw = "".join(t.text or "" for t in el if _local(t) == "t")
        if not raw:
            return ""
        rpr = el.find(_q(M, "rPr"))
        if rpr is not None:
            nor = rpr.find(_q(M, "nor"))
            plain = nor is not None and nor.get(_q(M, "val"), "1") in _TRUE
            if plain and raw.strip():
                return r"\text{" + re.sub(r"[\\{}]", "", raw) + "}"
        if raw.strip() in KNOWN_FUNCS:
            return "\\" + raw.strip() + " "
        return _tex_text(raw)

    # ---- structures
    def _f(self, el) -> str:
        num, den = self._sub(el, "num"), self._sub(el, "den")
        ftype = self._prop(el, "fPr", "type", "bar")
        if ftype == "lin":
            return f"{_group(num)}/{_group(den)}"
        if ftype == "noBar":
            return r"\binom" + _g(num) + _g(den)
        return r"\frac" + _g(num) + _g(den)

    def _sSup(self, el) -> str:
        return _group(self._sub(el, "e")) + "^" + _g(self._sub(el, "sup"))

    def _sSub(self, el) -> str:
        return _group(self._sub(el, "e")) + "_" + _g(self._sub(el, "sub"))

    def _sSubSup(self, el) -> str:
        return _group(self._sub(el, "e")) + "_" + _g(self._sub(el, "sub")) + "^" + _g(self._sub(el, "sup"))

    def _sPre(self, el) -> str:
        return "{}_" + _g(self._sub(el, "sub")) + "^" + _g(self._sub(el, "sup")) + _group(self._sub(el, "e"))

    def _rad(self, el) -> str:
        deg = self._sub(el, "deg").strip()
        hide = self._prop(el, "radPr", "degHide", "0") in _TRUE
        body = self._sub(el, "e")
        if deg and not hide:
            return r"\sqrt[" + deg + "]" + _g(body)
        return r"\sqrt" + _g(body)

    def _nary(self, el) -> str:
        ch = self._prop(el, "naryPr", "chr", "∫")
        cmd = NARY_CMD.get(ch, _tex_text(ch)).strip()
        sub, sup, body = self._sub(el, "sub").strip(), self._sub(el, "sup").strip(), self._sub(el, "e")
        out = cmd
        if sub and self._prop(el, "naryPr", "subHide", "0") not in _TRUE:
            out += "_" + _g(sub)
        if sup and self._prop(el, "naryPr", "supHide", "0") not in _TRUE:
            out += "^" + _g(sup)
        return out + " " + body

    def _d(self, el) -> str:
        beg = self._prop(el, "dPr", "begChr", "(")
        end = self._prop(el, "dPr", "endChr", ")")
        sep = self._prop(el, "dPr", "sepChr", "|")
        items = [self.conv_children(e) for e in el if _local(e) == "e"]
        left = _DELIM_OPEN.get(beg, beg)
        right = _DELIM_CLOSE.get(end, end)
        return r"\left" + left + (" " + _tex_text(sep) + " ").join(items) + r" \right" + right

    def _func(self, el) -> str:
        name = self._sub(el, "fName").strip()
        body = self._sub(el, "e")
        if re.fullmatch(r"[A-Za-z]{2,}", name):
            name = ("\\" + name) if name in KNOWN_FUNCS else r"\operatorname{" + name + "}"
        return name + " " + body

    def _limLow(self, el) -> str:
        base = self._sub(el, "e").strip()
        lim = self._sub(el, "lim")
        if base.startswith("\\"):  # operator such as \lim
            return base.rstrip() + "_" + _g(lim)
        if base in KNOWN_FUNCS:
            return "\\" + base + "_" + _g(lim)
        return r"\underset" + _g(lim) + _g(base)

    def _limUpp(self, el) -> str:
        return r"\overset" + _g(self._sub(el, "lim")) + _g(self._sub(el, "e"))

    def _acc(self, el) -> str:
        ch = self._prop(el, "accPr", "chr", "̂")
        return ACCENTS.get(ch, r"\hat") + _g(self._sub(el, "e"))

    def _bar(self, el) -> str:
        pos = self._prop(el, "barPr", "pos", "top")
        return (r"\underline" if pos == "bot" else r"\overline") + _g(self._sub(el, "e"))

    def _groupChr(self, el) -> str:
        ch = self._prop(el, "groupChrPr", "chr", "⏟")
        return (r"\overbrace" if ch == "⏞" else r"\underbrace") + _g(self._sub(el, "e"))

    def _borderBox(self, el) -> str:
        return r"\boxed" + _g(self._sub(el, "e"))

    def _box(self, el) -> str:
        return self._sub(el, "e")

    def _phant(self, el) -> str:
        return self._sub(el, "e")

    def _m(self, el) -> str:
        rows = [" & ".join(self.conv_children(e) for e in mr.findall(_q(M, "e"))) for mr in el.findall(_q(M, "mr"))]
        return r"\begin{matrix}" + r" \\ ".join(rows) + r"\end{matrix}"

    def _eqArr(self, el) -> str:
        rows = [self.conv_children(e) for e in el.findall(_q(M, "e"))]
        return r"\begin{aligned}" + r" \\ ".join(rows) + r"\end{aligned}"

    def _oMath(self, el) -> str:
        return self.conv_children(el)

    def _props(self, el) -> str:
        return ""

    _ctrlPr = _rPr = _fPr = _sSupPr = _sSubPr = _sSubSupPr = _radPr = _naryPr = _dPr = _props
    _accPr = _barPr = _funcPr = _limLowPr = _limUppPr = _mPr = _eqArrPr = _groupChrPr = _props
    _borderBoxPr = _boxPr = _phantPr = _sPrePr = _props


_CONV = OmmlConverter()


def omath_to_latex(omath) -> str:
    """Convert one m:oMath element to a LaTeX string (no $ delimiters)."""
    tex = re.sub(r"\s+", " ", _CONV.conv(omath)).strip()
    return tex.replace("{ ", "{").replace(" }", "}")


def _wrap(tex: str, display: bool) -> str:
    if not tex:
        return ""
    return "$" + (r"\displaystyle " if display else "") + tex + "$"


_WRAPPERS = {"hyperlink", "smartTag", "ins", "sdt", "sdtContent", "fldSimple", "customXml"}


def paragraph_text(p_el) -> str:
    """Reading-order text of a w:p element with equations inlined as `$...$`.

    Newlines come from w:br. An m:oMathPara in a paragraph with no other text is emitted as
    `$\\displaystyle ...$` (the web renderer only needs single-$ math); otherwise equations are inline.
    """
    parts: list[object] = []  # str, or (latex, is_para) tuples
    has_text = False

    def walk(node) -> None:
        nonlocal has_text
        for ch in node:
            if not isinstance(ch.tag, str):
                continue
            ns = ch.tag[1:].partition("}")[0]
            local = _local(ch)
            if ns == W and local == "r":
                for t in ch:
                    tl = _local(t)
                    if tl == "t" and t.text:
                        parts.append(t.text)
                        has_text = has_text or bool(t.text.strip())
                    elif tl == "tab":
                        parts.append("\t")
                    elif tl in ("br", "cr"):
                        parts.append("\n")
            elif ns == W and local in _WRAPPERS:
                walk(ch)
            elif ns == M and local == "oMath":
                parts.append((omath_to_latex(ch), False))
            elif ns == M and local == "oMathPara":
                parts.extend((omath_to_latex(om), True) for om in ch.findall(_q(M, "oMath")))
            elif ns == M and local in _WRAPPERS:
                walk(ch)

    walk(p_el)
    return "".join(
        _wrap(p[0], p[1] and not has_text) if isinstance(p, tuple) else p for p in parts
    )
