"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { api, type WeeklyRecapSettingsRow } from "../../../../lib/api";
import { SendTestButton } from "../../../../components/ui/SendTestButton";

export default function WeeklyRecapPage({ params }: { params: { guildId: string } }) {
  const [settings, setSettings] = useState<WeeklyRecapSettingsRow | null>(null);

  useEffect(() => {
    api.getWeeklyRecapSettings(params.guildId).then(setSettings);
  }, [params.guildId]);

  async function updateChannel(newChannelId: string) {
    const value = newChannelId || null;
    setSettings((prev) => (prev ? { ...prev, channelId: value } : prev));
    await api.updateWeeklyRecapSettings(params.guildId, { channelId: value });
  }

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="WEEKLY_RECAP"
        title="Weekly Recap"
        description="Every Monday, posts a recap embed showing your top-leveled members and richest members, based on current standings for Leveling and Economy (whichever are enabled)."
      />

      <NeonCard>
        <p className="font-medium mb-1">Recap Channel</p>
        <p className="text-xs text-slate-500 mb-3">The weekly recap embed is posted here every Monday at 13:00 UTC.</p>
        <ChannelSelect
          guildId={params.guildId}
          value={settings?.channelId ?? null}
          onChange={updateChannel}
          kind="text"
          placeholder="Off — not posting anywhere"
        />

        <div className="mt-4">
          <SendTestButton
            onSend={() => api.sendWeeklyRecapTest(params.guildId)}
            disabled={!settings?.channelId}
            successMessage="Sent — check the recap channel."
          />
        </div>
      </NeonCard>
    </div>
  );
}
