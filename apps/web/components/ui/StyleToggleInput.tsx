"use client";

import { useMemo } from "react";

export type ToggleStyleKey = "bold" | "italic" | "underline" | "strike" | "spoiler" | "code";

interface Marker {
  before: string;
  after: string;
  label: string;
  title: string;
  className: string;
}

const MARKERS: Record<ToggleStyleKey, Marker> = {
  bold: { before: "**", after: "**", label: "B", title: "Bold", className: "font-bold" },
  italic: { before: "*", after: "*", label: "I", title: "Italic", className: "italic" },
  underline: { before: "__", after: "__", label: "U", title: "Underline", className: "underline" },
  strike: { before: "~~", after: "~~", label: "S", title: "Strikethrough", className: "line-through" },
  spoiler: { before: "||", after: "||", label: "◇", title: "Spoiler", className: "" },
  code: { before: "`", after: "`", label: "<>", title: "Inline code", className: "font-mono text-[10px]" },
};

// Fixed outside-in order, both for building the stored value and parsing it
// back apart. Code sits innermost deliberately — Discord renders backtick
// contents completely literally, so nothing else can format *inside* it;
// every other style has to wrap around the outside of it instead.
const ORDER: ToggleStyleKey[] = ["code", "spoiler", "strike", "underline", "italic", "bold"];

function parseStyles(value: string): { plain: string; styles: Set<ToggleStyleKey> } {
  let text = value;
  const styles = new Set<ToggleStyleKey>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const key of [...ORDER].reverse()) {
      const { before, after } = MARKERS[key];
      if (text.length >= before.length + after.length && text.startsWith(before) && text.endsWith(after)) {
        text = text.slice(before.length, text.length - after.length);
        styles.add(key);
        changed = true;
      }
    }
  }
  return { plain: text, styles };
}

function formatValue(plain: string, styles: Set<ToggleStyleKey>): string {
  let text = plain;
  for (const key of ORDER) {
    if (styles.has(key)) {
      const { before, after } = MARKERS[key];
      text = before + text + after;
    }
  }
  return text;
}

interface StyleToggleInputProps {
  value: string;
  onChange: (next: string) => void;
  allow?: ToggleStyleKey[];
  placeholder?: string;
  className?: string;
}

// For short, single-line fields (embed title, field name) where a full
// toolbar-above-a-textarea doesn't fit well. The input itself always shows
// clean, unstyled text — formatting is applied to the whole field at once
// via the toggle row underneath, and only shows up in the live preview and
// in Discord, never as literal ** characters cluttering the field you're
// typing in.
export function StyleToggleInput({ value, onChange, allow = ORDER, placeholder, className }: StyleToggleInputProps) {
  const { plain, styles } = useMemo(() => parseStyles(value), [value]);

  function toggle(key: ToggleStyleKey) {
    const next = new Set(styles);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(formatValue(plain, next));
  }

  return (
    <div>
      <input className={className} value={plain} placeholder={placeholder} onChange={(e) => onChange(formatValue(e.target.value, styles))} />
      <div className="flex flex-wrap items-center gap-1 mt-1.5">
        {allow.map((key) => {
          const m = MARKERS[key];
          const active = styles.has(key);
          return (
            <button
              key={key}
              type="button"
              title={m.title}
              onClick={() => toggle(key)}
              className={`w-6 h-6 flex items-center justify-center rounded text-[10px] border transition-colors ${m.className} ${
                active
                  ? "bg-neon-blue/15 border-neon-blue/50 text-neon-blue"
                  : "bg-base-800 border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20"
              }`}
            >
              {m.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
