"use client";

import type { RefObject } from "react";

interface Placeholder {
  token: string;
  description: string;
}

interface PlaceholderExamplesProps {
  items: Placeholder[];
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement>;
  value: string;
  onChange: (next: string) => void;
}

// Click a token to insert it directly at the cursor in the target field —
// drop under any text input that supports {placeholder} substitution.
export function PlaceholderExamples({ items, inputRef, value, onChange }: PlaceholderExamplesProps) {
  function insert(token: string) {
    const el = inputRef.current;
    if (!el) {
      onChange(value + token);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <div className="mt-2 mb-4 flex flex-wrap gap-1">
      {items.map((item) => (
        <button
          key={item.token}
          type="button"
          title={item.description}
          onClick={() => insert(item.token)}
          className="bg-base-800 border border-white/10 hover:border-neon-blue/40 rounded-full px-2 py-0.5 text-[11px] font-mono text-slate-400 hover:text-neon-blue transition-colors"
        >
          {item.token}
        </button>
      ))}
    </div>
  );
}
