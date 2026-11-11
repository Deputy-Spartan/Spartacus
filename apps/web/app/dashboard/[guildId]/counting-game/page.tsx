"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { SettingRow, SettingsSection } from "../../../../components/ui/Settings";
import { api, type CountingGameConfig } from "../../../../lib/api";
import { useAutoSave } from "../../../../lib/useAutoSave";
import { SaveStatus } from "../../../../components/ui/SaveStatus";

export default function CountingGamePage({ params }: { params: { guildId: string } }) {
  const [config, setConfig] = useState<CountingGameConfig | null>(null);

  useEffect(() => {
    api.getCountingGame(params.guildId).then(setConfig);
  }, [params.guildId]);

  async function save() {
    if (!config) return;
    setConfig(await api.setCountingGame(params.guildId, config));
  }

  const autoSave = useAutoSave(config, save);

  if (!config) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="max-w-4xl">
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="COUNTING_GAME"
        title="Counting Game"
        description="Members count upward together, one number per message — the bot enforces the sequence."
      />

      <div className="grid grid-cols-2 gap-4 mb-4">
        <NeonCard className="stat-card">
          <p className="text-xs uppercase tracking-wide text-slate-500">Current count</p>
          <p className="text-2xl font-bold mt-2 text-neon-blue">{config.currentCount}</p>
        </NeonCard>
        <NeonCard className="stat-card">
          <p className="text-xs uppercase tracking-wide text-slate-500">High score</p>
          <p className="text-2xl font-bold mt-2">{config.highScore}</p>
        </NeonCard>
      </div>

      <SettingsSection title="Game">
        <SettingRow label="Counting channel" required help="Members count here. Spartacus checks every number." tip="Pick a channel used only for counting, so normal chat doesn't break the count.">
          <ChannelSelect guildId={params.guildId} value={config.channelId} onChange={(channelId) => setConfig({ ...config, channelId })} />
        </SettingRow>
        <SettingRow label="Reset on mistake" help="Start again from 1 when someone posts the wrong number.">
          <ToggleSwitch enabled={config.resetOnMistake} onChange={(next) => setConfig({ ...config, resetOnMistake: next })} label="Reset on mistake" />
        </SettingRow>
      </SettingsSection>

      <SaveStatus status={autoSave} onSave={save} />
    </div>
  );
}
