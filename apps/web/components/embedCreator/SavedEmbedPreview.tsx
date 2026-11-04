"use client";

import { useEffect, useState } from "react";
import { api, type EmbedCreatorPresetRow } from "../../lib/api";
import { EmbedCreatorPreview } from "./EmbedCreatorPreview";

// The saved embed a module posts, shown the way Discord will show it.
// `content` is text the module sends above it (a ping, for example).
export function SavedEmbedPreview({ guildId, savedEmbedId, content }: { guildId: string; savedEmbedId: string; content?: string }) {
  const [preset, setPreset] = useState<EmbedCreatorPresetRow | null | undefined>(undefined);

  useEffect(() => {
    api
      .getEmbedCreatorPresets(guildId)
      .then((rows) => setPreset(rows.find((p) => p.id === savedEmbedId) ?? null))
      .catch(() => setPreset(null));
  }, [guildId, savedEmbedId]);

  if (preset === undefined) return <p className="text-xs text-slate-500">Loading the saved embed…</p>;
  if (preset === null) return <p className="text-xs text-rose-400">That saved embed was deleted. Pick another one.</p>;
  return <EmbedCreatorPreview guildId={guildId} state={content !== undefined ? { ...preset.data, content: content || preset.data.content } : preset.data} />;
}
