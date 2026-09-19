"use client";

import { useEffect, useState } from "react";
import { api, type DiscordEmojiOption } from "../../lib/api";

const COMMON = ["🎮", "🎨", "🎵", "📢", "🔔", "⭐", "❤️", "🔥", "✅", "❌", "👍", "🎉", "🛡️", "⚔️", "🏆", "📚", "💬", "🎲", "🍿", "🌍"];

interface EmojiPickerProps {
  guildId: string;
  value: string;
  onChange: (emoji: string) => void;
}

// Type or paste any emoji (or a custom emoji code like <:name:123>), or pick
// one of this server's own emojis / a common one from the drawer.
export function EmojiPicker({ guildId, value, onChange }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState<DiscordEmojiOption[] | null>(null);

  useEffect(() => {
    if (open && custom === null) api.getDiscordEmojis(guildId).then(setCustom).catch(() => setCustom([]));
  }, [open, custom, guildId]);

  const customMatch = value.match(/^<a?:\w+:(\d+)>$/);

  return (
    <div className="relative">
      <div className="flex gap-1.5">
        <div className="relative flex-1 min-w-0">
          {customMatch && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`https://cdn.discordapp.com/emojis/${customMatch[1]}.png?size=32`} alt="" className="absolute left-2 top-1/2 -translate-y-1/2 h-5 w-5" />
          )}
          <input
            className={`w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm ${customMatch ? "pl-9" : ""}`}
            placeholder="🎮 or <:name:id>"
            value={value}
            onChange={(e) => onChange(e.target.value.trim())}
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          title="Pick an emoji"
          className="shrink-0 w-10 rounded-lg border border-white/10 bg-base-950 text-slate-400 hover:text-neon-blue hover:border-neon-blue/40"
        >
          😀
        </button>
      </div>

      {open && (
        <div className="mt-2 rounded-lg border border-white/10 bg-base-900 p-3 max-h-56 overflow-y-auto">
          <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">This server</p>
          <div className="flex flex-wrap gap-1 mb-3">
            {custom === null && <span className="text-xs text-slate-500">Loading…</span>}
            {custom?.length === 0 && <span className="text-xs text-slate-500">No custom emojis on this server.</span>}
            {custom?.map((e) => (
              <button
                key={e.id}
                type="button"
                title={e.name}
                onClick={() => {
                  onChange(e.token);
                  setOpen(false);
                }}
                className="p-1 rounded hover:bg-white/10"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? "gif" : "png"}?size=32`} alt={e.name} className="h-6 w-6" />
              </button>
            ))}
          </div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">Common</p>
          <div className="flex flex-wrap gap-1">
            {COMMON.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  onChange(e);
                  setOpen(false);
                }}
                className="h-8 w-8 text-lg rounded hover:bg-white/10"
              >
                {e}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-600 mt-3">
            Anything else: paste it, or use your OS emoji keyboard (Win + . on Windows). For a custom emoji from another server the bot is in, type
            <span className="font-mono"> \:name: </span> in Discord and paste the code it gives you.
          </p>
        </div>
      )}
    </div>
  );
}
