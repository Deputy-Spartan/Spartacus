"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { api, type RulesGateSettingsRow } from "../../../../lib/api";
import { SavedEmbedPicker } from "../../../../components/embedCreator/SavedEmbedPicker";
import Link from "next/link";

export default function RulesGatePage({ params }: { params: { guildId: string } }) {
  const [settings, setSettings] = useState<RulesGateSettingsRow | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getRulesGateSettings(params.guildId).then(setSettings);
  }, [params.guildId]);

  async function update(patch: Partial<RulesGateSettingsRow>) {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    await api.updateRulesGateSettings(params.guildId, patch);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="RULES_GATE"
        title="Rules Gate"
        description="Posts your rules embed with an '✅ I Agree' button in a channel — clicking it grants a role, confirming the member has read the rules."
      />

      <NeonCard className="max-w-xl">
        <p className="text-xs text-slate-500 mb-4">
          Build the full rules message below (title, images, links, multiple fields — even multiple embeds) in the{" "}
          <Link href={`/dashboard/${params.guildId}/embed-creator`} className="text-neon-blue hover:underline">
            Embed Creator
          </Link>
          , then pick it here. Saving posts (or reposts) it right away.
        </p>

        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Rules Channel</label>
        <ChannelSelect
          guildId={params.guildId}
          value={settings?.channelId ?? null}
          onChange={(id) => update({ channelId: id || null })}
          kind="text"
          placeholder="Off — no panel posted"
        />

        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2 mt-4">Role to Grant</label>
        <RoleSelect
          guildId={params.guildId}
          value={settings?.roleId ?? null}
          onChange={(id) => update({ roleId: id || null })}
          placeholder="No role configured yet"
        />

        <SavedEmbedPicker guildId={params.guildId} value={settings?.savedEmbedId ?? null} onChange={(id) => update({ savedEmbedId: id })} />

        {saved && <p className="text-xs text-emerald-400 mt-2">Saved ✓</p>}
      </NeonCard>
    </div>
  );
}
