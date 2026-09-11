"use client";

import { useEffect, useState } from "react";
import { CreateSavedEmbedModal } from "./CreateSavedEmbedModal";
import { api, type EmbedCreatorPresetRow } from "../../lib/api";

interface SavedEmbedPickerProps {
  guildId: string;
  value: string | null;
  onChange: (presetId: string | null) => void;
}

// Dropped into any feature that can post an embed (Welcome, Announcements,
// Giveaways, Custom Commands, Sticky Messages, Birthdays, Custom Slash
// Commands, LFG) — lets that feature point at a saved embed from the Embed
// Creator library instead of building its own embed. "+ Create new" opens a
// quick single-embed builder right here in a dialog rather than navigating
// away, so building and picking one stays a single, fluid flow.
export function SavedEmbedPicker({ guildId, value, onChange }: SavedEmbedPickerProps) {
  const [presets, setPresets] = useState<EmbedCreatorPresetRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  function refresh() {
    api.getEmbedCreatorPresets(guildId).then(setPresets);
  }
  useEffect(refresh, [guildId]);

  return (
    <div className="mt-5 pt-5 border-t border-white/5">
      <div className="flex items-center justify-between mb-2.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Use a Saved Embed</label>
        <button type="button" onClick={() => setModalOpen(true)} className="text-[11px] text-neon-blue hover:underline">
          + Create new
        </button>
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
      {presets.length === 0 ? (
        <p className="text-xs text-slate-600 mt-2">
          No saved embeds yet —{" "}
          <button type="button" onClick={() => setModalOpen(true)} className="text-neon-blue hover:underline">
            create one
          </button>{" "}
          and it'll show up here.
        </p>
      ) : (
        value && <p className="text-xs text-slate-600 mt-2">This overrides the fields below with the saved embed's content when sent.</p>
      )}

      {modalOpen && (
        <CreateSavedEmbedModal
          guildId={guildId}
          onClose={() => setModalOpen(false)}
          onCreated={(preset) => {
            setModalOpen(false);
            refresh();
            onChange(preset.id);
          }}
        />
      )}
    </div>
  );
}
