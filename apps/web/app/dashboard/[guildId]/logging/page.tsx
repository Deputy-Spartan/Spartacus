"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { api, type LoggingConfig } from "../../../../lib/api";

export default function LoggingPage({ params }: { params: { guildId: string } }) {
  const [config, setConfig] = useState<LoggingConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getLogging(params.guildId).then(setConfig);
  }, [params.guildId]);

  async function save() {
    if (!config) return;
    setSaving(true);
    setConfig(await api.setLogging(params.guildId, config));
    setSaving(false);
  }

  if (!config) return <p className="text-slate-400">Loading…</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Logging</h1>
      <p className="text-slate-400 mb-6">Send an audit trail of server activity to a channel — the bot posts these live.</p>

      <NeonCard className="max-w-lg">
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Log Channel</label>
        <ChannelSelect
          guildId={params.guildId}
          value={config.logChannelId}
          onChange={(channelId) => setConfig({ ...config, logChannelId: channelId })}
        />

        {[
          ["logEdits", "Message Edits", "Log the before/after of edited messages."],
          ["logDeletes", "Message Deletes", "Log deleted messages with author and channel."],
          ["logJoinsLeaves", "Member Joins/Leaves", "Log every join and leave event."],
          ["logVoice", "Voice Activity", "Log voice channel join/leave/move events."],
        ].map(([key, label, desc]) => (
          <div key={key} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
            <div>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-slate-500">{desc}</p>
            </div>
            <ToggleSwitch
              enabled={Boolean(config[key as keyof LoggingConfig])}
              onChange={(next) => setConfig({ ...config, [key]: next })}
              label={label}
            />
          </div>
        ))}
      </NeonCard>

      <button onClick={save} disabled={saving} className="neon-button mt-4">
        {saving ? "Saving…" : "Save Changes"}
      </button>
    </div>
  );
}
