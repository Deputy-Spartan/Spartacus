"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { api, type AntiNukeConfig } from "../../../../lib/api";

export default function AntiNukePage({ params }: { params: { guildId: string } }) {
  const [config, setConfig] = useState<AntiNukeConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getAntiNuke(params.guildId).then(setConfig);
  }, [params.guildId]);

  async function save() {
    if (!config) return;
    setSaving(true);
    setConfig(await api.setAntiNuke(params.guildId, config));
    setSaving(false);
  }

  if (!config) return <p className="text-slate-400">Loading…</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Anti-Nuke</h1>
      <p className="text-slate-400 mb-6">
        Watches the audit log for mass bans or channel deletions and can strip the offending account's roles automatically.
      </p>

      <NeonCard className="max-w-lg">
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Alert Channel</label>
        <ChannelSelect
          guildId={params.guildId}
          value={config.alertChannelId}
          onChange={(channelId) => setConfig({ ...config, alertChannelId: channelId })}
        />

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Max Bans / Minute</label>
            <input
              type="number"
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
              value={config.maxBansPerMinute}
              onChange={(e) => setConfig({ ...config, maxBansPerMinute: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Max Channel Deletes / Minute</label>
            <input
              type="number"
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
              value={config.maxChannelDeletesPerMinute}
              onChange={(e) => setConfig({ ...config, maxChannelDeletesPerMinute: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Strip Roles on Trigger</p>
            <p className="text-xs text-slate-500">Remove all roles from the account that tripped the threshold.</p>
          </div>
          <ToggleSwitch
            enabled={config.stripRolesOnTrigger}
            onChange={(next) => setConfig({ ...config, stripRolesOnTrigger: next })}
            label="Strip roles on trigger"
          />
        </div>
      </NeonCard>

      <button onClick={save} disabled={saving} className="neon-button mt-4">
        {saving ? "Saving…" : "Save Changes"}
      </button>
    </div>
  );
}
