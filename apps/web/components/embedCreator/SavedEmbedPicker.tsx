"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type EmbedCreatorPresetRow } from "../../lib/api";

interface SavedEmbedPickerProps {
  guildId: string;
  value: string | null;
  onChange: (presetId: string | null) => void;
}

// Dropped into any feature that can post an embed (Welcome, Announcements,
// Giveaways, Custom Commands, Sticky Messages, Birthdays, Custom Slash
// Commands, LFG) — lets that feature point at a saved embed from the Embed
// Creator library instead of building its own embed editor. Picking "None"
// falls back to that feature's own embed fields, so nothing already
// configured breaks.
export function SavedEmbedPicker({ guildId, value, onChange }: SavedEmbedPickerProps) {
  const [presets, setPresets] = useState<EmbedCreatorPresetRow[]>([]);

  useEffect(() => {
    api.getEmbedCreatorPresets(guildId).then(setPresets);
  }, [guildId]);

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs uppercase tracking-wide text-slate-500">Use a Saved Embed</label>
        <Link href={`/dashboard/${guildId}/embed-creator`} target="_blank" className="text-[11px] text-neon-blue hover:underline">
          + Create one in Embed Creator
        </Link>
      </div>
      <select
        className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">None — use the fields below</option>
        {presets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {presets.length === 0 && (
        <p className="text-xs text-slate-600 mt-1.5">
          No saved embeds yet — build one in{" "}
          <Link href={`/dashboard/${guildId}/embed-creator`} target="_blank" className="text-neon-blue hover:underline">
            Embed Creator
          </Link>{" "}
          and it'll show up here.
        </p>
      )}
      {value && <p className="text-xs text-slate-600 mt-1.5">This overrides the embed fields below with the saved embed's content when sent.</p>}
    </div>
  );
}
