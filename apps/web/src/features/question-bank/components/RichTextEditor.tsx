'use client';
import { useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Mathematics from '@tiptap/extension-mathematics';
import 'katex/dist/katex.min.css';
import type { RichDoc } from '@cbt/contracts';
import { MathField } from './MathField';

/**
 * Tiptap editor with KaTeX-rendered maths (`inlineMath` / `blockMath` nodes carry `attrs.latex`)
 * and a MathLive dialog for entering formulas visually. Content is exchanged as Tiptap JSON.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = 96,
}: {
  value: RichDoc;
  onChange: (doc: RichDoc) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const [mathOpen, setMathOpen] = useState(false);
  const [latex, setLatex] = useState('');
  const [block, setBlock] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, Mathematics],
    content: value,
    editorProps: { attributes: { class: 'prose max-w-none focus:outline-none', 'aria-label': placeholder ?? 'Rich text' } },
    onUpdate: ({ editor }) => onChange(editor.getJSON() as RichDoc),
  });

  const insert = () => {
    if (editor && latex.trim()) {
      const chain = editor.chain().focus();
      (block ? chain.insertBlockMath({ latex }) : chain.insertInlineMath({ latex })).run();
    }
    setMathOpen(false);
    setLatex('');
  };

  return (
    <div className="rounded-md border">
      <div className="flex flex-wrap gap-1 border-b p-1 text-sm">
        <button type="button" className="px-2" onClick={() => editor?.chain().focus().toggleBold().run()}>
          B
        </button>
        <button type="button" className="px-2 italic" onClick={() => editor?.chain().focus().toggleItalic().run()}>
          I
        </button>
        <button type="button" className="px-2" onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          List
        </button>
        <button type="button" className="px-2" onClick={() => setMathOpen(true)}>
          fx Math
        </button>
      </div>
      <div style={{ minHeight }} className="p-2">
        <EditorContent editor={editor} />
      </div>
      {mathOpen && (
        <div role="dialog" aria-label="Insert formula" className="space-y-2 border-t p-2">
          <MathField value="" onChange={setLatex} autoFocus />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} /> Display (own line)
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={insert} className="rounded bg-primary px-3 py-1 text-primary-foreground">
              Insert
            </button>
            <button type="button" onClick={() => setMathOpen(false)} className="px-3 py-1">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
