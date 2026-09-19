"use client";

import { useEffect, useState, type RefObject } from "react";
import { api, type DiscordChannelOption, type DiscordRoleOption } from "../../lib/api";
import { ServerEmojiGrid } from "./EmojiPicker";

interface MarkdownToolbarProps {
  guildId: string;
  textareaRef: RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (next: string) => void;
  // when true, emojis/roles are inserted as friendly ":name:" / "@name" (the
  // caller converts them back to Discord codes) instead of raw codes
  aliased?: boolean;
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
export function MarkdownToolbar({ guildId, textareaRef, value, onChange, aliased }: MarkdownToolbarProps) {
  const [channels, setChannels] = useState<DiscordChannelOption[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [roles, setRoles] = useState<DiscordRoleOption[]>([]);

  useEffect(() => {
    api.getDiscordChannels(guildId).then((result) => setChannels([...result.textChannels, ...result.voiceChannels]));
  }, [guildId]);

  useEffect(() => {
    api.getDiscordRoles(guildId).then(setRoles);
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

  function insertAtCursor(text: string, refocus = true) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      if (refocus) el.focus(); // skipped for emoji taps so a phone keyboard does not pop up each time
      el.setSelectionRange(start + text.length, start + text.length);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1 mb-1.5 relative">
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

      <select
        title="Insert role mention"
        value=""
        onChange={(e) => {
          if (e.target.value) {
            const role = roles.find((r) => r.id === e.target.value);
            insertAtCursor(aliased && role ? `@${role.name}` : `<@&${e.target.value}>`);
          }
        }}
        className="h-7 bg-base-800 border border-white/10 rounded text-xs text-slate-300 px-1 max-w-[140px]"
      >
        <option value="">@role…</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            @{r.name}
          </option>
        ))}
      </select>

      <button
        type="button"
        title="Insert a server emoji"
        onClick={() => setEmojiOpen(!emojiOpen)}
        className="w-7 h-7 flex items-center justify-center rounded bg-base-800 border border-white/10 text-sm hover:border-neon-blue/40"
      >
        😀
      </button>

      {emojiOpen && (
        <div className="basis-full rounded-lg border border-white/10 bg-base-900 p-3 max-h-48 overflow-y-auto">
          <p className="text-[11px] text-slate-500 mb-1.5">Tap as many as you like — each is added at your cursor.</p>
          <ServerEmojiGrid
            guildId={guildId}
            onPick={(e) => {
              insertAtCursor(aliased ? `:${e.name}:` : e.token, false);
            }}
          />
        </div>
      )}
    </div>
  );
}
