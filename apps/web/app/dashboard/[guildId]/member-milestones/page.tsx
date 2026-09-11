"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { api, type MilestoneSettingsRow } from "../../../../lib/api";

export default function MemberMilestonesPage({ params }: { params: { guildId: string } }) {
  const [settings, setSettings] = useState<MilestoneSettingsRow | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getMilestoneSettings(params.guildId).then(setSettings);
  }, [params.guildId]);

  async function update(patch: Partial<MilestoneSettingsRow>) {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    await api.updateMilestoneSettings(params.guildId, patch);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="MEMBER_MILESTONES"
        title="Member Milestones"
        description="Celebrates join-date anniversaries (1 year, 2 years, ...) using each member's own join date — distinct from the Birthdays module. Once daily, posts one combined message listing everyone with an anniversary that day."
      />

      <NeonCard className="max-w-xl">
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Milestones Channel</label>
        <ChannelSelect
          guildId={params.guildId}
          value={settings?.channelId ?? null}
          onChange={(id) => update({ channelId: id || null })}
          kind="text"
          placeholder="Off — not posting anywhere"
        />

        {saved && <p className="text-xs text-emerald-400 mt-2">Saved ✓</p>}
      </NeonCard>
    </div>
  );
}
