"use client";

import { useEffect, useState } from "react";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { NumberInput, SettingRow, SettingsSection } from "../../../../components/ui/Settings";
import { api, type AntiNukeConfig } from "../../../../lib/api";
import { useAutoSave } from "../../../../lib/useAutoSave";
import { SaveStatus } from "../../../../components/ui/SaveStatus";

export default function AntiNukePage({ params }: { params: { guildId: string } }) {
  const [config, setConfig] = useState<AntiNukeConfig | null>(null);

  useEffect(() => {
    api.getAntiNuke(params.guildId).then(setConfig);
  }, [params.guildId]);

  async function save() {
    if (!config) return;
    setConfig(await api.setAntiNuke(params.guildId, config));
  }

  const autoSave = useAutoSave(config, save);

  if (!config) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="max-w-4xl">
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="ANTI_NUKE"
        title="Anti-Nuke"
        description="Watches the audit log for mass bans or channel deletions and can strip the offending account's roles automatically."
      />

      <SettingsSection title="Alerts">
        <SettingRow label="Alert channel" help="Where Spartacus posts when someone trips a limit.">
          <ChannelSelect guildId={params.guildId} value={config.alertChannelId} onChange={(channelId) => setConfig({ ...config, alertChannelId: channelId })} />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Limits">
        <SettingRow label="Max bans per minute" help="More bans than this in one minute, by one account, sets it off." tip="Staff rarely ban several people a minute. A compromised account usually bans dozens.">
          <NumberInput label="Max bans per minute" value={config.maxBansPerMinute} onChange={(n) => setConfig({ ...config, maxBansPerMinute: n })} min={1} />
        </SettingRow>
        <SettingRow label="Max channel deletes per minute" help="More channel deletions than this in one minute sets it off.">
          <NumberInput label="Max channel deletes per minute" value={config.maxChannelDeletesPerMinute} onChange={(n) => setConfig({ ...config, maxChannelDeletesPerMinute: n })} min={1} />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Response">
        <SettingRow label="Strip roles on trigger" help="Remove every role from the account that tripped a limit." tip="Taking its roles away stops it doing more damage while you look into it. Spartacus's role must be above that account's roles.">
          <ToggleSwitch enabled={config.stripRolesOnTrigger} onChange={(next) => setConfig({ ...config, stripRolesOnTrigger: next })} label="Strip roles on trigger" />
        </SettingRow>
      </SettingsSection>

      <SaveStatus status={autoSave} onSave={save} />
    </div>
  );
}
