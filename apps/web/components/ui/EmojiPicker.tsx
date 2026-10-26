"use client";

import { useEffect, useState } from "react";
import { api, type DiscordEmojiOption } from "../../lib/api";
import { STANDARD_EMOJI_CATEGORIES } from "../../lib/standardEmojis";

function emojiUrl(id: string, animated: boolean) {
  return `https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "png"}?size=48`;
}

// The clickable grid of this server's own custom emojis.
export function ServerEmojiGrid({ guildId, onPick }: { guildId: string; onPick: (emoji: DiscordEmojiOption) => void }) {
  const [emojis, setEmojis] = useState<DiscordEmojiOption[] | null>(null);

  useEffect(() => {
    api.getDiscordEmojis(guildId).then(setEmojis).catch(() => setEmojis([]));
  }, [guildId]);

  if (emojis === null) return <p className="text-xs text-slate-500">Loading emojis…</p>;
  if (emojis.length === 0) return <p className="text-xs text-slate-500">This server has no custom emojis yet. Add some in Server Settings → Emoji.</p>;
  return (
    <div className="flex flex-wrap gap-1">
      {emojis.map((e) => (
        <button key={e.id} type="button" title={`:${e.name}:`} onClick={() => onPick(e)} className="p-1 rounded hover:bg-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={emojiUrl(e.id, e.animated)} alt={e.name} className="h-7 w-7" />
        </button>
      ))}
    </div>
  );
}

// The clickable grid of standard Unicode emoji, grouped into categories
// with a left-hand rail to jump between them.
function StandardEmojiGrid({ onPick }: { onPick: (emoji: string) => void }) {
  const [cat, setCat] = useState(0);
  return (
    <div className="flex gap-2">
      <div className="flex flex-col gap-0.5 w-20 shrink-0 overflow-y-auto max-h-48">
        {STANDARD_EMOJI_CATEGORIES.map((c, i) => (
          <button
            key={c.label}
            type="button"
            onClick={() => setCat(i)}
            className={`text-left text-[10.5px] px-1.5 py-1 rounded ${i === cat ? "bg-neon-blue/15 text-neon-blue" : "text-slate-500 hover:text-slate-300"}`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="flex-1 flex flex-wrap gap-0.5 max-h-48 overflow-y-auto content-start">
        {STANDARD_EMOJI_CATEGORIES[cat].emojis.map((e, i) => (
          <button key={e + i} type="button" onClick={() => onPick(e)} className="text-lg p-1 rounded hover:bg-white/10 leading-none">
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

interface EmojiPickerProps {
  guildId: string;
  value: string;
  onChange: (emoji: string) => void;
}

// Picker for any emoji — a standard Unicode one (the full curated set, not
// just this server's custom emojis) or one of this server's own custom
// emojis. The stored value is either the raw unicode character or the
// server emoji's full <:name:id> token; the button face renders whichever
// one it currently holds instead of only recognizing custom-emoji tokens.
export function EmojiPicker({ guildId, value, onChange }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"standard" | "server">("standard");
  const customMatch = value.match(/^<(a?):(\w+):(\d+)>$/);

  return (
    <div>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex-1 min-w-0 flex items-center gap-2 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm text-left hover:border-neon-blue/40"
        >
          {customMatch ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={emojiUrl(customMatch[3], customMatch[1] === "a")} alt="" className="h-5 w-5" />
              <span className="truncate text-slate-300">:{customMatch[2]}:</span>
            </>
          ) : value ? (
            <span className="text-lg leading-none">{value}</span>
          ) : (
            <span className="text-slate-500">Choose an emoji…</span>
          )}
        </button>
        {value && (
          <button type="button" onClick={() => onChange("")} className="shrink-0 w-10 rounded-lg border border-white/10 bg-base-950 text-slate-500 hover:text-rose-400">
            ×
          </button>
        )}
      </div>
      {open && (
        <div className="mt-2 rounded-lg border border-white/10 bg-base-900 p-3">
          <div className="flex gap-1 mb-2">
            <button
              type="button"
              onClick={() => setTab("standard")}
              className={`flex-1 text-xs px-2 py-1 rounded ${tab === "standard" ? "bg-neon-blue/15 text-neon-blue" : "text-slate-500 hover:text-slate-300"}`}
            >
              Any emoji
            </button>
            <button
              type="button"
              onClick={() => setTab("server")}
              className={`flex-1 text-xs px-2 py-1 rounded ${tab === "server" ? "bg-neon-blue/15 text-neon-blue" : "text-slate-500 hover:text-slate-300"}`}
            >
              Server emojis
            </button>
          </div>
          {tab === "standard" ? (
            <StandardEmojiGrid
              onPick={(e) => {
                onChange(e);
                setOpen(false);
              }}
            />
          ) : (
            <ServerEmojiGrid
              guildId={guildId}
              onPick={(e) => {
                onChange(e.token);
                setOpen(false);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
