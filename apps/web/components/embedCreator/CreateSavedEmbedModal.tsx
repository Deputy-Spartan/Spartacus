"use client";

import { useState } from "react";
import { EmbedCard } from "./EmbedCard";
import { api, type EmbedCreatorEmbed, type EmbedCreatorPresetRow } from "../../lib/api";

function emptyEmbed(): EmbedCreatorEmbed {
  return { id: "e" + Math.random().toString(36).slice(2, 9), color: "#7B99BC", fields: [] };
}

interface Props {
  guildId: string;
  onClose: () => void;
  onCreated: (preset: EmbedCreatorPresetRow) => void;
}

// A focused, single-embed version of the full Embed Creator builder, opened
// as an in-page dialog instead of navigating away — reuses the same EmbedCard
// editor so the fields are identical, just without the multi-embed list,
// components, or send settings that the full page has.
export function CreateSavedEmbedModal({ guildId, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [embed, setEmbed] = useState<EmbedCreatorEmbed>(emptyEmbed());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) {
      setError("Give this saved embed a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const preset = await api.saveEmbedCreatorPreset(guildId, name.trim(), {
        content: "",
        deliveryMode: "bot",
        channelId: "",
        webhookUrl: "",
        profileName: "",
        profileAvatar: "",
        embeds: [embed],
        components: [],
      });
      onCreated(preset);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save embed");
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-base-900 border border-white/10 rounded-xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-base-900 border-b border-white/5 px-5 py-4 flex items-center justify-between z-10">
          <p className="font-medium">New Saved Embed</p>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-sm">
            ✕
          </button>
        </div>

        <div className="p-5">
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Name</label>
          <input
            autoFocus
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Welcome Announcement"
          />

          <EmbedCard guildId={guildId} embed={embed} index={0} onChange={setEmbed} onDuplicate={() => {}} onRemove={() => setEmbed(emptyEmbed())} />

          {error && <p className="text-xs text-rose-400 mt-1 mb-2">{error}</p>}

          <div className="flex gap-2 mt-2">
            <button onClick={handleSave} disabled={saving} className="neon-button flex-1 disabled:opacity-50">
              {saving ? "Saving…" : "Save Embed"}
            </button>
            <button onClick={onClose} className="neon-button-sm">
              Cancel
            </button>
          </div>
          <p className="text-[11px] text-slate-600 mt-3">
            Need multiple embeds, buttons, or a webhook? Open the full <span className="text-slate-400">Embed Creator</span> page instead — this quick version covers one embed.
          </p>
        </div>
      </div>
    </div>
  );
}
