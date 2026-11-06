"use client";

import { useEffect, useState } from "react";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { NumberInput, SettingRow, SettingsSection } from "../../../../components/ui/Settings";
import { api, type AntiRaidConfig } from "../../../../lib/api";
import { useAutoSave } from "../../../../lib/useAutoSave";
import { SaveStatus } from "../../../../components/ui/SaveStatus";

export default function AntiRaidPage({ params }: { params: { guildId: string } }) {
  const [config, setConfig] = useState<AntiRaidConfig | null>(null);

  useEffect(() => {
    api.getAntiRaid(params.guildId).then(setConfig);
  }, [params.guildId]);

  async function save() {
    if (!config) return;
    setConfig(await api.setAntiRaid(params.guildId, config));
  }

  const autoSave = useAutoSave(config, save);

  if (!config) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="max-w-4xl">
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="ANTI_RAID"
        title="Anti-Raid"
        description="The bot kicks new-account joiners and alerts a channel when the join rate spikes."
      />

      <SettingsSection title="Alerts">
        <SettingRow label="Alert channel" help="Where Spartacus posts when it spots a raid.">
          <ChannelSelect guildId={params.guildId} value={config.alertChannelId} onChange={(channelId) => setConfig({ ...config, alertChannelId: channelId })} />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="What counts as a raid">
        <SettingRow label="Join rate limit" help="This many joins…" tip="Together with the window below: for example 10 joins within 30 seconds counts as a raid.">
          <NumberInput label="Join rate limit" value={config.joinRateLimit} onChange={(n) => setConfig({ ...config, joinRateLimit: n })} min={1} />
        </SettingRow>
        <SettingRow label="Window (seconds)" help="…within this many seconds.">
          <NumberInput label="Window in seconds" value={config.joinRateWindowSec} onChange={(n) => setConfig({ ...config, joinRateWindowSec: n })} min={1} />
        </SettingRow>
        <SettingRow label="Minimum account age (days)" help="During a raid, accounts younger than this are kicked." tip="Raid accounts are usually brand new. Older, real accounts are left alone.">
          <NumberInput label="Minimum account age in days" value={config.minAccountAgeDays} onChange={(n) => setConfig({ ...config, minAccountAgeDays: n })} min={0} />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Response">
        <SettingRow label="Auto-lockdown" help="Lock every text channel automatically when a raid is detected." tip="Members can't post until staff unlock the channels again, which stops a raid from flooding chat.">
          <ToggleSwitch enabled={config.autoLockdown} onChange={(next) => setConfig({ ...config, autoLockdown: next })} label="Auto-lockdown" />
        </SettingRow>
      </SettingsSection>

      <SaveStatus status={autoSave} onSave={save} />
    </div>
  );
}
