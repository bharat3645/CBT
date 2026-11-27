/**
 * Question snippets are plain text with inline LaTeX and no delimiters (for search), so KaTeX cannot render them.
 * For the list view, turn the common commands into readable symbols: ∫₀², x², π, a/b, √x.
 */
const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", n: "ⁿ", x: "ˣ", "(": "⁽", ")": "⁾" };
const SUB: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", n: "ₙ", x: "ₓ" };
const SYMBOLS: Record<string, string> = {
  pi: "π", theta: "θ", alpha: "α", beta: "β", gamma: "γ", delta: "δ", lambda: "λ", mu: "μ", sigma: "σ", omega: "ω", phi: "φ", Delta: "Δ",
  infty: "∞", int: "∫", sum: "∑", times: "×", cdot: "·", div: "÷", pm: "±", le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠",
  approx: "≈", to: "→", rightarrow: "→", degree: "°", circ: "°", sin: "sin", cos: "cos", tan: "tan", log: "log", ln: "ln", lim: "lim",
};

const script = (s: string, map: Record<string, string>, mark: string) =>
  [...s].every((c) => map[c]) ? [...s].map((c) => map[c]).join("") : `${mark}${s.length > 1 ? `(${s})` : s}`;

export function readableMath(text: string): string {
  let s = text
    .replace(/\\(displaystyle|textstyle|left|right|mathrm|text|operatorname)\b/g, "")
    .replace(/\\[,;:! ]/g, " ")
    .replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a, b) => `${a.length > 1 ? `(${a})` : a}/${b.length > 1 ? `(${b})` : b}`)
    .replace(/\\sqrt\{([^{}]*)\}/g, "√($1)")
    .replace(/\\([A-Za-z]+)/g, (m, w) => SYMBOLS[w] ?? w);
  s = s
    .replace(/\^\{([^{}]*)\}/g, (_, x) => script(x, SUP, "^"))
    .replace(/\^([0-9a-z+-])/g, (_, x) => script(x, SUP, "^"))
    .replace(/_\{([^{}]*)\}/g, (_, x) => script(x, SUB, "_"))
    .replace(/_([0-9a-z])/g, (_, x) => script(x, SUB, "_"))
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const TYPE_LABEL: Record<string, string> = {
  mcq_single: "MCQ (single)",
  mcq_multi: "MCQ (multiple)",
  numeric: "Numerical",
  true_false: "True / false",
  subjective: "Subjective",
};
