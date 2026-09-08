"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { api, type WelcomeConfig } from "../../../../lib/api";

export default function WelcomePage({ params }: { params: { guildId: string } }) {
  const [config, setConfig] = useState<WelcomeConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getWelcome(params.guildId).then(setConfig);
  }, [params.guildId]);

  async function save() {
    if (!config) return;
    setSaving(true);
    const saved = await api.setWelcome(params.guildId, config);
    setConfig(saved);
    setSaving(false);
  }

  if (!config) return <p className="text-slate-400">Loading…</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Welcome & Goodbye</h1>
      <p className="text-slate-400 mb-6">
        Use <code className="text-neon-blue">{"{user}"}</code> and{" "}
        <code className="text-neon-blue">{"{server}"}</code> as placeholders.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NeonCard>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Welcome Channel</label>
          <ChannelSelect
            guildId={params.guildId}
            value={config.channelId}
            onChange={(channelId) => setConfig({ ...config, channelId })}
            placeholder="Select a channel…"
          />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Welcome Message</label>
          <textarea
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm min-h-20 mb-4 focus:outline-none focus:ring-1 focus:ring-neon-blue"
            value={config.welcomeText}
            onChange={(e) => setConfig({ ...config, welcomeText: e.target.value })}
          />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Goodbye Message</label>
          <textarea
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm min-h-20 focus:outline-none focus:ring-1 focus:ring-neon-blue"
            value={config.goodbyeText}
            onChange={(e) => setConfig({ ...config, goodbyeText: e.target.value })}
          />
        </NeonCard>

        <NeonCard>
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-3">Live Preview</p>
          <div
            className="rounded-lg p-4 flex gap-3 items-center"
            style={{ background: "#1E2640", borderLeft: `3px solid ${config.embedColor}` }}
          >
            <div className="w-11 h-11 rounded-full bg-neon-gradient shrink-0" />
            <p className="text-sm">
              {config.welcomeText.replace("{server}", "Iron Legion").replace("{user}", "@Draven")}
            </p>
          </div>
        </NeonCard>
      </div>

      <button onClick={save} disabled={saving} className="neon-button mt-4">
        {saving ? "Saving…" : "Save Changes"}
      </button>
    </div>
  );
}
