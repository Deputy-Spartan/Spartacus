"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { api, type BumpReminderSettingsRow } from "../../../../lib/api";

export default function BumpReminderPage({ params }: { params: { guildId: string } }) {
  const [settings, setSettings] = useState<BumpReminderSettingsRow | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getBumpReminderSettings(params.guildId).then(setSettings);
  }, [params.guildId]);

  async function update(patch: Partial<BumpReminderSettingsRow>) {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    await api.updateBumpReminderSettings(params.guildId, patch);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="BUMP_REMINDER"
        title="Bump Reminder"
        description="Watches for Disboard's 'Bump done!' confirmation and reminds the channel again once the 2-hour cooldown is up."
      />

      <NeonCard className="max-w-xl">
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Reminder Channel</label>
        <ChannelSelect
          guildId={params.guildId}
          value={settings?.channelId ?? null}
          onChange={(id) => update({ channelId: id || null })}
          kind="text"
          placeholder="Off — not reminding anywhere"
        />

        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2 mt-4">Mention Role (optional)</label>
        <RoleSelect
          guildId={params.guildId}
          value={settings?.mentionRoleId ?? null}
          onChange={(id) => update({ mentionRoleId: id || null })}
          placeholder="No role pinged"
        />

        {settings?.nextReminderAt && (
          <p className="text-xs text-slate-500 mt-4">
            Next reminder: {new Date(settings.nextReminderAt).toLocaleString()}
          </p>
        )}
        {saved && <p className="text-xs text-emerald-400 mt-2">Saved ✓</p>}
      </NeonCard>
    </div>
  );
}
