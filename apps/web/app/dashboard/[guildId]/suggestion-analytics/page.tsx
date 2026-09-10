"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { api, type SuggestionAnalyticsSettingsRow } from "../../../../lib/api";

export default function SuggestionAnalyticsPage({ params }: { params: { guildId: string } }) {
  const [settings, setSettings] = useState<SuggestionAnalyticsSettingsRow | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getSuggestionAnalyticsSettings(params.guildId).then(setSettings);
  }, [params.guildId]);

  async function update(channelId: string) {
    const value = channelId || null;
    setSettings({ channelId: value });
    await api.updateSuggestionAnalyticsSettings(params.guildId, { channelId: value });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="SUGGESTION_ANALYTICS"
        title="Suggestion Analytics"
        description="Posts a weekly digest of the most-upvoted suggestions from the past 7 days to a channel of your choosing."
      />

      <NeonCard className="max-w-xl">
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Digest Channel</label>
        <ChannelSelect
          guildId={params.guildId}
          value={settings?.channelId ?? null}
          onChange={update}
          kind="text"
          placeholder="Off — not posting anywhere"
        />
        {saved && <p className="text-xs text-emerald-400 mt-2">Saved ✓</p>}
      </NeonCard>
    </div>
  );
}
