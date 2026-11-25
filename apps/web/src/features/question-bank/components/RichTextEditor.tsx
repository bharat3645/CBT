'use client';
import { useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Mathematics from '@tiptap/extension-mathematics';
import { Bold, ImagePlus, Italic, List, ListOrdered, Sigma, Underline as UnderlineIcon } from 'lucide-react';
import { Button, cn } from '@cbt/ui';
import 'katex/dist/katex.min.css';
import type { RichDoc } from '@cbt/contracts';
import { MathField } from './MathField';

/** Block image node. `src` is a data URL (images are embedded in the question document). */
const QuestionImage = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return { src: { default: null }, alt: { default: '' } };
  },
  parseHTML() {
    return [{ tag: 'img[src]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes, { class: 'max-w-full h-auto rounded' })];
  },
});

const MAX_IMAGE_CHARS = 560_000; // ~400 KB of binary once base64-encoded

/** Reads an image file as a data URL, downscaling large rasters so the question document stays small. */
async function imageToDataUrl(file: File): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  if (file.size <= 120_000 || file.type === 'image/svg+xml') return raw;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Could not read image'));
    i.src = raw;
  });
  const scale = Math.min(1, 900 / img.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return raw;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}

function ToolButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn('size-7', active && 'bg-primary/10 text-primary')}
    >
      {children}
    </Button>
  );
}

/**
 * Tiptap editor with an office-style toolbar, KaTeX-rendered maths (`inlineMath` / `blockMath` nodes carry
 * `attrs.latex`), a MathLive dialog for formulas, and image attach (embedded as data URLs).
 * Content is exchanged as Tiptap JSON.
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
  const [imgError, setImgError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [, force] = useState(0);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, Mathematics, QuestionImage],
    content: value,
    editorProps: { attributes: { class: 'prose max-w-none focus:outline-none', 'aria-label': placeholder ?? 'Rich text' } },
    onUpdate: ({ editor }) => onChange(editor.getJSON() as RichDoc),
    onSelectionUpdate: () => force((n) => n + 1),
  });

  const insert = () => {
    if (editor && latex.trim()) {
      const chain = editor.chain().focus();
      (block ? chain.insertBlockMath({ latex }) : chain.insertInlineMath({ latex })).run();
    }
    setMathOpen(false);
    setLatex('');
  };

  async function attach(file: File | undefined) {
    if (!file) return;
    setImgError('');
    if (!file.type.startsWith('image/')) return setImgError('Choose an image file');
    try {
      const src = await imageToDataUrl(file);
      if (src.length > MAX_IMAGE_CHARS) return setImgError('Image is too large (max about 400 KB after resizing)');
      editor?.chain().focus().insertContent({ type: 'image', attrs: { src, alt: file.name } }).run();
    } catch (e) {
      setImgError(e instanceof Error ? e.message : 'Could not attach image');
    }
  }

  const is = (name: string) => !!editor?.isActive(name);
  const sep = <span aria-hidden className="mx-1 h-5 w-px bg-border" />;

  return (
    <div className="overflow-hidden rounded-md border border-input bg-card focus-within:ring-2 focus-within:ring-ring">
      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/40 px-1.5 py-1">
        <ToolButton label="Bold" active={is('bold')} onClick={() => editor?.chain().focus().toggleBold().run()}>
          <Bold />
        </ToolButton>
        <ToolButton label="Italic" active={is('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <Italic />
        </ToolButton>
        <ToolButton label="Underline" active={is('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon />
        </ToolButton>
        {sep}
        <ToolButton label="Bulleted list" active={is('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          <List />
        </ToolButton>
        <ToolButton label="Numbered list" active={is('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          <ListOrdered />
        </ToolButton>
        {sep}
        <ToolButton label="Insert formula" active={mathOpen} onClick={() => setMathOpen((o) => !o)}>
          <Sigma />
        </ToolButton>
        <ToolButton label="Attach image" onClick={() => fileRef.current?.click()}>
          <ImagePlus />
        </ToolButton>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          aria-label="Image file"
          className="hidden"
          onChange={(e) => {
            void attach(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      <div style={{ minHeight }} className="px-3 py-2">
        <EditorContent editor={editor} />
      </div>
      {imgError && (
        <p role="alert" className="border-t border-border px-3 py-1.5 text-xs text-destructive">
          {imgError}
        </p>
      )}
      {mathOpen && (
        <div role="dialog" aria-label="Insert formula" className="space-y-2 border-t border-border bg-muted/30 p-3">
          <div className="rounded-md border border-input bg-card">
            <MathField value="" onChange={setLatex} autoFocus />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} /> Display (own line)
          </label>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={insert}>
              Insert
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMathOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
