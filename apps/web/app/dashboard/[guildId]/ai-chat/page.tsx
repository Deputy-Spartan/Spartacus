"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { api, type AiConfigRow } from "../../../../lib/api";

export default function AiChatPage({ params }: { params: { guildId: string } }) {
  const [config, setConfig] = useState<AiConfigRow | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getAiConfig(params.guildId).then(setConfig);
  }, [params.guildId]);

  async function persist(next: AiConfigRow) {
    setConfig(next);
    setSaving(true);
    await api.setAiConfig(params.guildId, next);
    setSaving(false);
  }

  if (!config) return <p className="text-slate-400">Loading…</p>;

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="AI_CHAT"
        title="AI Chat"
        description="Mention the bot anywhere it can see and it replies using an AI model. Requires an Anthropic API key to be configured on the bot."
      />

      <NeonCard>
        <div className="flex items-center justify-between mb-4">
          <p className="font-medium">Settings</p>
          {saving && <span className="text-xs text-slate-600">Saving…</span>}
        </div>

        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Restrict to Channel (optional)</label>
        <ChannelSelect
          guildId={params.guildId}
          value={config.chatChannelId}
          onChange={(channelId) => persist({ ...config, chatChannelId: channelId })}
          placeholder="Respond anywhere it's @-mentioned"
        />

        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Personality / System Prompt</label>
        <textarea
          className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm min-h-24"
          value={config.chatSystemPrompt ?? ""}
          onChange={(e) => setConfig({ ...config, chatSystemPrompt: e.target.value })}
          onBlur={() => persist(config)}
          placeholder="e.g. You are a sarcastic pirate who helps with Discord questions."
        />
        <p className="text-xs text-slate-600 mt-2">Leave blank for the default helpful-assistant personality.</p>
      </NeonCard>
    </div>
  );
}
