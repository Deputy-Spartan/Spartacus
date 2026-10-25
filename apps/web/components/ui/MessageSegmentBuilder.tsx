"use client";

import { useState } from "react";

export interface SegmentToken {
  key: string;
  label: string;
}

interface Segment {
  id: string;
  type: "text" | "token";
  text?: string;
  key?: string;
  label?: string;
  enabled: boolean;
}

let nextId = 0;
const freshId = () => `seg${nextId++}`;

// Splits an existing {token} template string into blocks on first mount —
// the component then owns the block list itself (not re-synced from value
// on every keystroke), emitting the serialized string back up via onChange.
// This lets the dashboard keep storing a single plain-text template exactly
// like before (same field, same bot-side token substitution), while editing
// it here as reorderable/toggleable blocks instead of raw text.
function parseTemplate(template: string, tokens: SegmentToken[]): Segment[] {
  if (!template.trim()) return [];
  const keys = [...tokens]
    .sort((a, b) => b.key.length - a.key.length)
    .map((t) => t.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const re = new RegExp(`\\{(${keys})\\}`, "g");
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(template))) {
    const text = template.slice(lastIndex, match.index).trim();
    if (text) segments.push({ id: freshId(), type: "text", text, enabled: true });
    const tok = tokens.find((t) => t.key === match![1]);
    if (tok) segments.push({ id: freshId(), type: "token", key: tok.key, label: tok.label, enabled: true });
    lastIndex = re.lastIndex;
  }
  const rest = template.slice(lastIndex).trim();
  if (rest) segments.push({ id: freshId(), type: "text", text: rest, enabled: true });
  return segments;
}

export function serializeSegments(segments: Segment[]): string {
  let out = "";
  for (const seg of segments) {
    if (!seg.enabled) continue;
    const piece = seg.type === "token" ? `{${seg.key}}` : (seg.text ?? "").trim();
    if (!piece) continue;
    // Skip the leading space before punctuation that should hug the word
    // before it (",", "!", "?", etc.) so "{server}" + "," reads as
    // "{server}," instead of "{server} ,".
    if (out && !/^[,.!?;:]/.test(piece)) out += " ";
    out += piece;
  }
  return out;
}

interface MessageSegmentBuilderProps {
  value: string;
  onChange: (next: string) => void;
  tokens: SegmentToken[];
}

export function MessageSegmentBuilder({ value, onChange, tokens }: MessageSegmentBuilderProps) {
  const [segments, setSegments] = useState<Segment[]>(() => parseTemplate(value, tokens));

  function commit(next: Segment[]) {
    setSegments(next);
    onChange(serializeSegments(next));
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= segments.length) return;
    const next = [...segments];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  }

  function toggle(i: number) {
    const next = [...segments];
    next[i] = { ...next[i], enabled: !next[i].enabled };
    commit(next);
  }

  function updateText(i: number, text: string) {
    const next = [...segments];
    next[i] = { ...next[i], text };
    setSegments(next); // onChange fires on blur to avoid re-serializing every keystroke
  }

  function remove(i: number) {
    commit(segments.filter((_, idx) => idx !== i));
  }

  function addText() {
    commit([...segments, { id: freshId(), type: "text", text: "", enabled: true }]);
  }

  function addToken(tok: SegmentToken) {
    commit([...segments, { id: freshId(), type: "token", key: tok.key, label: tok.label, enabled: true }]);
  }

  return (
    <div>
      <div className="space-y-1.5 mb-2">
        {segments.map((seg, i) => (
          <div
            key={seg.id}
            className={`flex items-center gap-2 bg-base-800 border border-white/10 rounded-lg px-2 py-1.5 ${seg.enabled ? "" : "opacity-45"}`}
          >
            <div className="flex flex-col shrink-0">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="text-[10px] leading-none text-slate-500 hover:text-neon-blue disabled:opacity-25 px-1"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === segments.length - 1}
                className="text-[10px] leading-none text-slate-500 hover:text-neon-blue disabled:opacity-25 px-1"
              >
                ▼
              </button>
            </div>

            <span
              className={`shrink-0 text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${
                seg.type === "token" ? "bg-neon-blue/15 text-neon-blue" : "bg-purple-500/15 text-purple-300"
              }`}
            >
              {seg.type === "token" ? "mention" : "text"}
            </span>

            {seg.type === "token" ? (
              <span className="flex-1 min-w-0 text-xs text-slate-400">{seg.label}</span>
            ) : (
              <input
                className="flex-1 min-w-0 bg-base-950 border border-white/10 rounded-md px-2 py-1 text-xs"
                value={seg.text ?? ""}
                onChange={(e) => updateText(i, e.target.value)}
                onBlur={() => commit(segments)}
                placeholder="Text"
              />
            )}

            <button
              type="button"
              onClick={() => toggle(i)}
              className={`shrink-0 w-8 h-[18px] rounded-full relative transition-colors ${seg.enabled ? "bg-neon-blue" : "bg-base-950 border border-white/10"}`}
              title={seg.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
            >
              <span
                className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${
                  seg.enabled ? "translate-x-[18px]" : "translate-x-[2px]"
                }`}
              />
            </button>

            <button type="button" onClick={() => remove(i)} className="shrink-0 text-slate-500 hover:text-rose-400 text-sm px-1">
              ×
            </button>
          </div>
        ))}
        {segments.length === 0 && <p className="text-xs text-slate-600">No blocks yet — add some below.</p>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={addText} className="px-2.5 py-1 rounded-lg text-xs bg-base-950 border border-white/10 text-slate-300 hover:border-neon-blue/40 hover:text-neon-blue">
          + Text
        </button>
        {tokens.map((tok) => (
          <button
            key={tok.key}
            type="button"
            onClick={() => addToken(tok)}
            className="px-2.5 py-1 rounded-lg text-xs bg-base-950 border border-white/10 text-neon-blue/80 hover:border-neon-blue/40 hover:text-neon-blue"
          >
            + {tok.label}
          </button>
        ))}
      </div>
    </div>
  );
}
