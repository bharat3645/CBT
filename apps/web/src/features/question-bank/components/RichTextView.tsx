import katex from 'katex';
import type { ReactNode } from 'react';
import type { RichDoc } from '@cbt/contracts';

function Math({ latex, display }: { latex: string; display?: boolean }) {
  const html = katex.renderToString(latex, { displayMode: display, throwOnError: false });
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function node(n: RichDoc, key: number): ReactNode {
  const kids = (n.content ?? []).map(node);
  switch (n.type) {
    case 'text':
      return <span key={key}>{n.text}</span>;
    case 'inlineMath':
      return <Math key={key} latex={String(n.attrs?.latex ?? '')} />;
    case 'blockMath':
      return <Math key={key} display latex={String(n.attrs?.latex ?? '')} />;
    case 'paragraph':
      return <p key={key}>{kids}</p>;
    case 'bulletList':
      return <ul key={key}>{kids}</ul>;
    case 'orderedList':
      return <ol key={key}>{kids}</ol>;
    case 'listItem':
      return <li key={key}>{kids}</li>;
    default:
      return <div key={key}>{kids}</div>;
  }
}

/** Read-only renderer for stored question content (also usable by the CBT engine and reports). */
export function RichTextView({ doc }: { doc: RichDoc }) {
  return <div className="prose max-w-none">{node(doc, 0)}</div>;
}
