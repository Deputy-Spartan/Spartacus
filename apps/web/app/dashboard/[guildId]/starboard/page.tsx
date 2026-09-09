"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { api, type StarboardConfig } from "../../../../lib/api";

export default function StarboardPage({ params }: { params: { guildId: string } }) {
  const [config, setConfig] = useState<StarboardConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getStarboard(params.guildId).then(setConfig);
  }, [params.guildId]);

  async function save() {
    if (!config) return;
    setSaving(true);
    setConfig(await api.setStarboard(params.guildId, config));
    setSaving(false);
  }

  if (!config) return <p className="text-slate-400">Loading…</p>;

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="STARBOARD"
        title="Starboard"
        description="Any message that hits the ⭐ threshold gets reposted here automatically, and stays updated as more people star it."
      />

      <NeonCard className="max-w-lg">
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Starboard Channel</label>
        <ChannelSelect
          guildId={params.guildId}
          value={config.channelId}
          onChange={(channelId) => setConfig({ ...config, channelId })}
        />

        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">⭐ Threshold</label>
        <input
          type="number"
          min={1}
          className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
          value={config.threshold}
          onChange={(e) => setConfig({ ...config, threshold: Number(e.target.value) })}
        />
      </NeonCard>

      <button onClick={save} disabled={saving} className="neon-button mt-4">
        {saving ? "Saving…" : "Save Changes"}
      </button>
    </div>
  );
}
