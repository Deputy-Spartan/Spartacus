"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { api, type AntiRaidConfig } from "../../../../lib/api";
import { useAutoSave } from "../../../../lib/useAutoSave";
import { SaveStatus } from "../../../../components/ui/SaveStatus";

export default function AntiRaidPage({ params }: { params: { guildId: string } }) {
  const [config, setConfig] = useState<AntiRaidConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getAntiRaid(params.guildId).then(setConfig);
  }, [params.guildId]);

  async function save() {
    if (!config) return;
    setSaving(true);
    setConfig(await api.setAntiRaid(params.guildId, config));
    setSaving(false);
  }

  const autoSave = useAutoSave(config, save);

  if (!config) return <p className="text-slate-400">Loading…</p>;

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="ANTI_RAID"
        title="Anti-Raid"
        description="The bot kicks new-account joiners and alerts a channel when the join rate spikes."
      />

      <NeonCard className="max-w-lg">
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Alert Channel</label>
        <ChannelSelect
          guildId={params.guildId}
          value={config.alertChannelId}
          onChange={(channelId) => setConfig({ ...config, alertChannelId: channelId })}
        />

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Join Rate Limit</label>
            <input
              type="number"
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
              value={config.joinRateLimit}
              onChange={(e) => setConfig({ ...config, joinRateLimit: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Window (seconds)</label>
            <input
              type="number"
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
              value={config.joinRateWindowSec}
              onChange={(e) => setConfig({ ...config, joinRateWindowSec: Number(e.target.value) })}
            />
          </div>
        </div>

        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Min Account Age (days) to Skip Kick</label>
        <input
          type="number"
          className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
          value={config.minAccountAgeDays}
          onChange={(e) => setConfig({ ...config, minAccountAgeDays: Number(e.target.value) })}
        />

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Auto-Lockdown</p>
            <p className="text-xs text-slate-500">Lock every text channel automatically when a raid is detected.</p>
          </div>
          <ToggleSwitch
            enabled={config.autoLockdown}
            onChange={(next) => setConfig({ ...config, autoLockdown: next })}
            label="Auto-lockdown"
          />
        </div>
      </NeonCard>

      <button onClick={save} disabled={saving} className="neon-button mt-4">
        {saving ? "Saving…" : "Save Changes"}
      </button>
      <SaveStatus status={autoSave} />
    </div>
  );
}
