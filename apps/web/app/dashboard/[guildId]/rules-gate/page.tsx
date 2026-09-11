"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { api, type RulesGateSettingsRow } from "../../../../lib/api";

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
        description="Posts a single '✅ I Agree' button in a channel — clicking it grants a role, confirming the member has read the rules."
      />

      <NeonCard className="max-w-xl">
        <p className="text-xs text-slate-500 mb-4">
          This only adds the agree-button panel — post your actual rules text as a normal message in the
          channel first, then set it below.
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

        {saved && <p className="text-xs text-emerald-400 mt-2">Saved ✓</p>}
      </NeonCard>
    </div>
  );
}
