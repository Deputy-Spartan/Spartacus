"use client";

import { useEffect, useState, type RefObject } from "react";
import { api, type DiscordChannelOption } from "../../lib/api";

interface MarkdownToolbarProps {
  guildId: string;
  textareaRef: RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (next: string) => void;
}

const WRAP_BUTTONS = [
  { label: "B", title: "Bold", before: "**", after: "**", className: "font-bold" },
  { label: "I", title: "Italic", before: "*", after: "*", className: "italic" },
  { label: "U", title: "Underline", before: "__", after: "__", className: "underline" },
  { label: "S", title: "Strikethrough", before: "~~", after: "~~", className: "line-through" },
  { label: "❝", title: "Quote", before: "> ", after: "", className: "" },
  { label: "◇", title: "Spoiler", before: "||", after: "||", className: "" },
  { label: "<>", title: "Inline code", before: "`", after: "`", className: "font-mono text-xs" },
  { label: "{ }", title: "Code block", before: "```\n", after: "\n```", className: "font-mono text-xs" },
];

// Everything Discord's own message composer supports formatting-wise —
// wraps the current textarea selection, or inserts at the cursor if
// nothing's selected. Also inserts real channel mentions (<#id>), which
// render as clickable channel links in Discord.
export function MarkdownToolbar({ guildId, textareaRef, value, onChange }: MarkdownToolbarProps) {
  const [channels, setChannels] = useState<DiscordChannelOption[]>([]);

  useEffect(() => {
    api.getDiscordChannels(guildId).then((result) => setChannels([...result.textChannels, ...result.voiceChannels]));
  }, [guildId]);

  function applyWrap(before: string, after: string) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  function insertAtCursor(text: string) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1 mb-1.5">
      {WRAP_BUTTONS.map((b) => (
        <button
          key={b.title}
          type="button"
          title={b.title}
          onClick={() => applyWrap(b.before, b.after)}
          className={`w-7 h-7 flex items-center justify-center rounded bg-base-800 border border-white/10 text-slate-300 hover:text-neon-blue hover:border-neon-blue/40 text-xs ${b.className}`}
        >
          {b.label}
        </button>
      ))}

      <select
        title="Insert channel mention"
        value=""
        onChange={(e) => {
          if (e.target.value) insertAtCursor(`<#${e.target.value}>`);
        }}
        className="h-7 bg-base-800 border border-white/10 rounded text-xs text-slate-300 px-1 max-w-[140px]"
      >
        <option value="">#channel…</option>
        {channels.map((c) => (
          <option key={c.id} value={c.id}>
            #{c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
