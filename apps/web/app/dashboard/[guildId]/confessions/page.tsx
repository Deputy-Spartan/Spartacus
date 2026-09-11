"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { api, type ConfessionSettingsRow } from "../../../../lib/api";

export default function ConfessionsPage({ params }: { params: { guildId: string } }) {
  const [settings, setSettings] = useState<ConfessionSettingsRow | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getConfessionSettings(params.guildId).then(setSettings);
  }, [params.guildId]);

  async function update(patch: Partial<ConfessionSettingsRow>) {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    await api.updateConfessionSettings(params.guildId, patch);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="CONFESSIONS"
        title="Confessions"
        description="Lets members post anonymous confessions via /confess. No identity is ever attached to a posted confession, and no history of past confessions is stored — only the running counter persists."
      />

      <NeonCard className="max-w-xl">
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Confessions Channel</label>
        <ChannelSelect
          guildId={params.guildId}
          value={settings?.channelId ?? null}
          onChange={(id) => update({ channelId: id || null })}
          kind="text"
          placeholder="Off — /confess disabled"
        />

        {settings && (
          <p className="text-xs text-slate-500 mt-4">
            Next confession will be <span className="text-slate-300">#{settings.nextNumber}</span>
          </p>
        )}
        {saved && <p className="text-xs text-emerald-400 mt-2">Saved ✓</p>}
      </NeonCard>
    </div>
  );
}
