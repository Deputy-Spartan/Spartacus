"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type DiscordEmojiOption } from "../../lib/api";
import { SKIN_TONE_SWATCHES, loadStandardEmojis, withSkinTone, type EmojiCategory } from "../../lib/standardEmojis";

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

// Every standard emoji Discord supports: search by name, jump by category,
// and pick a skin tone (remembered in this browser).
const TONE_KEY = "spartacus_emoji_tone";
export function StandardEmojiGrid({ onPick }: { onPick: (emoji: string) => void }) {
  const [cats, setCats] = useState<EmojiCategory[] | null>(null);
  const [cat, setCat] = useState(0);
  const [q, setQ] = useState("");
  const [tone, setTone] = useState(() => {
    try {
      return Number(localStorage.getItem(TONE_KEY)) || 0;
    } catch {
      return 0;
    }
  });
  const [toneOpen, setToneOpen] = useState(false);

  useEffect(() => {
    loadStandardEmojis().then(setCats).catch(() => setCats([]));
  }, []);

  const term = q.trim().toLowerCase().replace(/[\s_:-]+/g, "");
  const shown = useMemo(() => {
    if (!cats) return [];
    if (term) return cats.flatMap((c) => c.emojis).filter((e) => e.search.includes(term)).slice(0, 240);
    return cats[cat]?.emojis ?? [];
  }, [cats, cat, term]);

  function pickTone(t: number) {
    setTone(t);
    setToneOpen(false);
    try {
      localStorage.setItem(TONE_KEY, String(t));
    } catch {
      // private window: the tone just isn't remembered
    }
  }

  if (cats === null) return <p className="text-xs text-slate-500">Loading emojis…</p>;
  if (cats.length === 0) return <p className="text-xs text-rose-400">Couldn't load the emoji list. Refresh and try again.</p>;

  return (
    <div>
      <div className="flex gap-1.5 mb-2">
        <input
          className="flex-1 min-w-0 bg-base-950 border border-white/10 rounded-md px-2 py-1.5 text-xs"
          placeholder="Search emojis, e.g. fire or thumbs up"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <div className="relative">
          <button type="button" title="Skin tone" onClick={() => setToneOpen((v) => !v)} className="h-full px-1.5 rounded-md border border-white/10 bg-base-950 text-base leading-none">
            {SKIN_TONE_SWATCHES[tone]}
          </button>
          {toneOpen && (
            <div className="absolute right-0 top-full mt-1 z-40 flex gap-0.5 rounded-md border border-white/10 bg-base-900 p-1 shadow-xl">
              {SKIN_TONE_SWATCHES.map((t, i) => (
                <button key={t} type="button" onClick={() => pickTone(i)} className={`text-lg p-0.5 rounded leading-none ${i === tone ? "bg-neon-blue/20" : "hover:bg-white/10"}`}>
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {!term && (
        <div className="flex gap-0.5 mb-2 overflow-x-auto">
          {cats.map((c, i) => (
            <button
              key={c.label}
              type="button"
              title={c.label}
              onClick={() => setCat(i)}
              className={`shrink-0 text-base px-1.5 py-1 rounded leading-none ${i === cat ? "bg-neon-blue/15" : "opacity-60 hover:opacity-100"}`}
            >
              {c.icon}
            </button>
          ))}
        </div>
      )}
      <p className="text-[10.5px] uppercase tracking-wide text-slate-500 mb-1">{term ? `${shown.length} result${shown.length === 1 ? "" : "s"}` : cats[cat]?.label}</p>
      <div className="flex flex-wrap gap-0.5 max-h-52 overflow-y-auto content-start">
        {shown.length === 0 && <p className="text-xs text-slate-500">No emojis match that.</p>}
        {shown.map((e) => {
          const out = withSkinTone(e, tone);
          return (
            <button key={e.emoji} type="button" title={`:${e.name.replace(/\s+/g, "_")}:`} onClick={() => onPick(out)} className="text-xl p-1 rounded hover:bg-white/10 leading-none">
              {out}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface EmojiPickerProps {
  guildId: string;
  value: string;
  onChange: (emoji: string) => void;
  // Floats the panel over the page instead of pushing the layout down, for narrow columns.
  popover?: boolean;
  placeholder?: string;
}

// Picker for any emoji — a standard Unicode one (the full curated set, not
// just this server's custom emojis) or one of this server's own custom
// emojis. The stored value is either the raw unicode character or the
// server emoji's full <:name:id> token; the button face renders whichever
// one it currently holds instead of only recognizing custom-emoji tokens.
export function EmojiPicker({ guildId, value, onChange, popover, placeholder = "Choose an emoji…" }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"standard" | "server">("standard");
  const customMatch = value.match(/^<(a?):(\w+):(\d+)>$/);

  return (
    <div className={popover ? "relative" : undefined}>
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
            <span className={[...value].length > 8 ? "truncate text-xs text-rose-300" : "text-lg leading-none"} title={value}>
              {value}
            </span>
          ) : (
            <span className="text-slate-500 truncate">{placeholder}</span>
          )}
        </button>
        {value && (
          <button type="button" onClick={() => onChange("")} className="shrink-0 w-10 rounded-lg border border-white/10 bg-base-950 text-slate-500 hover:text-rose-400">
            ×
          </button>
        )}
      </div>
      {open && (
        <div
          className={
            popover
              ? "absolute left-0 top-full z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-white/10 bg-base-900 p-3 shadow-2xl"
              : "mt-2 rounded-lg border border-white/10 bg-base-900 p-3"
          }
        >
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
