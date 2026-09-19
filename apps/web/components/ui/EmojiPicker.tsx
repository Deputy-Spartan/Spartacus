"use client";

import { useEffect, useState } from "react";
import { api, type DiscordEmojiOption } from "../../lib/api";

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

interface EmojiPickerProps {
  guildId: string;
  value: string;
  onChange: (emoji: string) => void;
}

// Select-only picker for one of the server's own emojis — nobody has to type
// or paste an emoji code. The stored value is still the full code the bot
// needs, but it is never shown as text.
export function EmojiPicker({ guildId, value, onChange }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const match = value.match(/^<(a?):(\w+):(\d+)>$/);

  return (
    <div>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex-1 min-w-0 flex items-center gap-2 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm text-left hover:border-neon-blue/40"
        >
          {match ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={emojiUrl(match[3], match[1] === "a")} alt="" className="h-5 w-5" />
              <span className="truncate text-slate-300">:{match[2]}:</span>
            </>
          ) : (
            <span className="text-slate-500">Choose a server emoji…</span>
          )}
        </button>
        {value && (
          <button type="button" onClick={() => onChange("")} className="shrink-0 w-10 rounded-lg border border-white/10 bg-base-950 text-slate-500 hover:text-rose-400">
            ×
          </button>
        )}
      </div>
      {open && (
        <div className="mt-2 rounded-lg border border-white/10 bg-base-900 p-3 max-h-56 overflow-y-auto">
          <ServerEmojiGrid
            guildId={guildId}
            onPick={(e) => {
              onChange(e.token);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
