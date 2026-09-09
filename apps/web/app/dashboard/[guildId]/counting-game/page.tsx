"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { api, type CountingGameConfig } from "../../../../lib/api";

export default function CountingGamePage({ params }: { params: { guildId: string } }) {
  const [config, setConfig] = useState<CountingGameConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getCountingGame(params.guildId).then(setConfig);
  }, [params.guildId]);

  async function save() {
    if (!config) return;
    setSaving(true);
    setConfig(await api.setCountingGame(params.guildId, config));
    setSaving(false);
  }

  if (!config) return <p className="text-slate-400">Loading…</p>;

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="COUNTING_GAME"
        title="Counting Game"
        description="Members count upward together, one number per message — the bot enforces the sequence."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NeonCard>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Counting Channel</label>
          <ChannelSelect
            guildId={params.guildId}
            value={config.channelId}
            onChange={(channelId) => setConfig({ ...config, channelId })}
          />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Reset on Mistake</p>
              <p className="text-xs text-slate-500">Restart from 1 if the wrong number is posted.</p>
            </div>
            <ToggleSwitch
              enabled={config.resetOnMistake}
              onChange={(next) => setConfig({ ...config, resetOnMistake: next })}
              label="Reset on mistake"
            />
          </div>
        </NeonCard>

        <div className="space-y-4">
          <NeonCard className="stat-card">
            <p className="text-xs uppercase tracking-wide text-slate-500">Current Count</p>
            <p className="text-2xl font-bold mt-2 text-neon-blue">{config.currentCount}</p>
          </NeonCard>
          <NeonCard className="stat-card">
            <p className="text-xs uppercase tracking-wide text-slate-500">High Score</p>
            <p className="text-2xl font-bold mt-2">{config.highScore}</p>
          </NeonCard>
        </div>
      </div>

      <button onClick={save} disabled={saving} className="neon-button mt-4">
        {saving ? "Saving…" : "Save Changes"}
      </button>
    </div>
  );
}
