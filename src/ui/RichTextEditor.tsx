import React, { useEffect, useRef, useState } from 'react';
import { Bold, Italic, List, RemoveFormatting, Underline } from 'lucide-react';

const COLORS = ['#152033', '#b87333', '#2f6f78', '#a63d3d'];

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
};

function looksLikeHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function escapeText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'DIV', 'P', 'SPAN', 'UL', 'OL', 'LI', 'FONT']);

function safeStyle(value: string) {
  const keep: string[] = [];
  const take = (prop: string, pattern: RegExp) => {
    const match = value.match(pattern);
    if (!match) return;
    const raw = match[1].trim();
    if (!/^[#(),.%\w\s-]+$/.test(raw)) return;
    keep.push(`${prop}: ${raw}`);
  };
  take('color', /(?:^|;)\s*color\s*:\s*([^;]+)/i);
  take('font-weight', /font-weight\s*:\s*([^;]+)/i);
  take('font-style', /font-style\s*:\s*([^;]+)/i);
  take('text-decoration', /text-decoration(?:-line)?\s*:\s*([^;]+)/i);
  return keep.join('; ');
}

function sanitize(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const clean = (node: Node) => {
    const children = [...node.childNodes];
    for (const child of children) {
      if (child.nodeType !== 1) continue;
      const el = child as HTMLElement;
      if (!ALLOWED.has(el.tagName)) {
        el.replaceWith(...el.childNodes);
        clean(node);
        continue;
      }
      for (const attr of [...el.attributes]) {
        if (el.tagName === 'FONT' && attr.name === 'color') continue;
        if (attr.name === 'style') {
          const style = safeStyle(attr.value);
          if (style) el.setAttribute('style', style);
          else el.removeAttribute(attr.name);
          continue;
        }
        el.removeAttribute(attr.name);
      }
      clean(el);
    }
  };
  clean(doc.body);
  return doc.body.innerHTML;
}

function toEditorHtml(value: string) {
  if (!value) return '';
  return sanitize(looksLikeHtml(value) ? value : escapeText(value));
}

export function RichTextEditor({ value, onChange, placeholder }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const internal = useRef(false);
  const [empty, setEmpty] = useState(!value.replace(/<[^>]+>/g, '').trim());

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (internal.current) {
      internal.current = false;
      return;
    }
    el.innerHTML = toEditorHtml(value);
    setEmpty(!el.textContent?.trim());
  }, [value]);

  const apply = (command: string, arg?: string) => {
    const el = ref.current;
    const selection = window.getSelection();
    const saved = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;
    el?.focus();
    if (saved && selection && el?.contains(saved.commonAncestorContainer)) {
      selection.removeAllRanges();
      selection.addRange(saved);
    }
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(command, false, arg);
    const html = sanitize(ref.current?.innerHTML || '');
    internal.current = true;
    setEmpty(!ref.current?.textContent?.trim());
    onChange(html);
  };

  return (
    <div className="flex flex-col gap-2 flex-1">
      <div className="rte-toolbar" role="toolbar" aria-label="Game plan formatting">
        <button type="button" className="rte-btn" title="Bold" aria-label="Bold" onMouseDown={(e) => e.preventDefault()} onClick={() => apply('bold')}>
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button type="button" className="rte-btn" title="Italic" aria-label="Italic" onMouseDown={(e) => e.preventDefault()} onClick={() => apply('italic')}>
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button type="button" className="rte-btn" title="Underline" aria-label="Underline" onMouseDown={(e) => e.preventDefault()} onClick={() => apply('underline')}>
          <Underline className="h-3.5 w-3.5" />
        </button>
        <button type="button" className="rte-btn" title="Bullet list" aria-label="Bullet list" onMouseDown={(e) => e.preventDefault()} onClick={() => apply('insertUnorderedList')}>
          <List className="h-3.5 w-3.5" />
        </button>
        <span className="mx-1 h-4 w-px bg-[var(--line)]" aria-hidden />
        {COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className="rte-swatch"
            style={{ background: color }}
            title={`Text color ${color}`}
            aria-label={`Text color ${color}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => apply('foreColor', color)}
          />
        ))}
        <label className="rte-btn cursor-pointer" title="Custom text color">
          <span className="sr-only">Custom text color</span>
          <input
            type="color"
            className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
            aria-label="Custom text color"
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => apply('foreColor', e.target.value)}
          />
        </label>
        <button type="button" className="rte-btn" title="Clear formatting" aria-label="Clear formatting" onMouseDown={(e) => e.preventDefault()} onClick={() => apply('removeFormat')}>
          <RemoveFormatting className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="relative flex-1">
        {empty && (
          <div className="pointer-events-none absolute left-3 top-2.5 text-sm text-[var(--ink-mute)]">
            {placeholder}
          </div>
        )}
        <div
          ref={ref}
          className="rte input"
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label="Game plan"
          onInput={() => {
            const html = sanitize(ref.current?.innerHTML || '');
            internal.current = true;
            setEmpty(!ref.current?.textContent?.trim());
            onChange(html);
          }}
        />
      </div>
    </div>
  );
}
