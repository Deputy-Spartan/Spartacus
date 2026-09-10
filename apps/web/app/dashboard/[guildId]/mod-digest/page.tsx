"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { api, type ModDigestSettingsRow } from "../../../../lib/api";

export default function ModDigestPage({ params }: { params: { guildId: string } }) {
  const [settings, setSettings] = useState<ModDigestSettingsRow | null>(null);

  useEffect(() => {
    api.getModDigestSettings(params.guildId).then(setSettings);
  }, [params.guildId]);

  async function updateChannel(newChannelId: string) {
    const value = newChannelId || null;
    setSettings((prev) => (prev ? { ...prev, channelId: value } : prev));
    await api.updateModDigestSettings(params.guildId, { channelId: value });
  }

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="MOD_DIGEST"
        title="Mod Accountability Digest"
        description="Every Monday, posts a summary of the past week's moderation actions — warns, mutes, kicks, and bans — broken down by moderator."
      />

      <NeonCard>
        <p className="font-medium mb-1">Digest Channel</p>
        <p className="text-xs text-slate-500 mb-3">The weekly digest embed is posted here every Monday at 12:00 UTC.</p>
        <ChannelSelect
          guildId={params.guildId}
          value={settings?.channelId ?? null}
          onChange={updateChannel}
          kind="text"
          placeholder="Off — not posting anywhere"
        />
      </NeonCard>
    </div>
  );
}
