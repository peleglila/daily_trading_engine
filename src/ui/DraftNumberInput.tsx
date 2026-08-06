import React, { useEffect, useState } from 'react';

type Props = {
  value: number;
  onCommit: (n: number) => void;
  className?: string;
  title?: string;
  step?: string;
  placeholder?: string;
};

/**
 * Number field that keeps a string draft while typing so clearing digits
 * doesn't snap back via Math.max / || 0 coercion mid-edit.
 */
export function DraftNumberInput({
  value,
  onCommit,
  className = '',
  title,
  step = 'any',
  placeholder,
}: Props) {
  const [draft, setDraft] = useState(value > 0 ? String(value) : '');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(value > 0 ? String(value) : value === 0 ? '' : String(value));
  }, [value, focused]);

  const commit = () => {
    const cleaned = draft.trim().replace(/,/g, '');
    if (cleaned === '' || cleaned === '-') {
      onCommit(0);
      setDraft('');
      return;
    }
    const n = Number(cleaned);
    if (Number.isFinite(n)) {
      onCommit(n);
      setDraft(n === 0 ? '' : String(n));
    } else {
      setDraft(value > 0 ? String(value) : '');
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      title={title}
      placeholder={placeholder}
      value={draft}
      onFocus={() => setFocused(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          (e.target as HTMLInputElement).blur();
        }
      }}
      step={step}
    />
  );
}
