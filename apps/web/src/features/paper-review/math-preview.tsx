"use client";

import * as React from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

/** Renders text with $...$ (inline) and $$...$$ (display) maths through KaTeX. Bad maths shows as red source, never throws. */
export function MathText({ text, className }: { text: string; className?: string }) {
  const html = React.useMemo(() => {
    const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
    return text
      .split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g)
      .map((part) => {
        const display = part.startsWith("$$") && part.endsWith("$$") && part.length > 4;
        const inline = !display && part.startsWith("$") && part.endsWith("$") && part.length > 2;
        if (!display && !inline) return esc(part);
        const src = display ? part.slice(2, -2) : part.slice(1, -1);
        return katex.renderToString(src, { displayMode: display, throwOnError: false, errorColor: "var(--destructive)" });
      })
      .join("");
  }, [text]);
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Shown under an edit field: how the text will look to students, only when it contains maths. */
export function MathPreview({ text }: { text: string }) {
  if (!text.includes("$")) return null;
  return (
    <div className="mt-1 rounded-md border border-dashed border-border bg-muted/40 px-2 py-1.5 text-sm">
      <span className="mr-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Preview</span>
      <MathText text={text} />
    </div>
  );
}
