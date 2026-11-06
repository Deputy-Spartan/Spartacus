"use client";

import { useEffect, useState } from "react";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { SettingRow, SettingsSection } from "../../../../components/ui/Settings";
import { api, type HoneypotConfig } from "../../../../lib/api";
import { useAutoSave } from "../../../../lib/useAutoSave";
import { SaveStatus } from "../../../../components/ui/SaveStatus";

export default function HoneypotPage({ params }: { params: { guildId: string } }) {
  const [config, setConfig] = useState<HoneypotConfig | null>(null);

  useEffect(() => {
    api.getHoneypot(params.guildId).then(setConfig);
  }, [params.guildId]);

  async function save() {
    if (!config) return;
    setConfig(await api.setHoneypot(params.guildId, config));
  }

  const autoSave = useAutoSave(config, save);

  if (!config) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="max-w-4xl">
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="HONEYPOT"
        title="Honeypot"
        description={
          <>
            Create a channel real members are told to avoid — anyone who posts in it is instantly banned. Hide it from
            @everyone in Discord's channel permissions so only bots and raiders find it.
          </>
        }
      />

      <SettingsSection title="Trap">
        <SettingRow
          label="Honeypot channel"
          required
          help="Anyone who posts here is banned straight away."
          tip="Hide this channel from @everyone in Discord's permissions, so only bots and raiders that post everywhere find it."
        >
          <ChannelSelect guildId={params.guildId} value={config.channelId} onChange={(channelId) => setConfig({ ...config, channelId })} />
        </SettingRow>
      </SettingsSection>

      <SaveStatus status={autoSave} onSave={save} />
    </div>
  );
}
