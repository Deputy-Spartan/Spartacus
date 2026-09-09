"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { api, type HoneypotConfig } from "../../../../lib/api";

export default function HoneypotPage({ params }: { params: { guildId: string } }) {
  const [config, setConfig] = useState<HoneypotConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getHoneypot(params.guildId).then(setConfig);
  }, [params.guildId]);

  async function save() {
    if (!config) return;
    setSaving(true);
    setConfig(await api.setHoneypot(params.guildId, config));
    setSaving(false);
  }

  if (!config) return <p className="text-slate-400">Loading…</p>;

  return (
    <div>
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

      <NeonCard className="max-w-lg">
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Honeypot Channel</label>
        <ChannelSelect
          guildId={params.guildId}
          value={config.channelId}
          onChange={(channelId) => setConfig({ ...config, channelId })}
        />
      </NeonCard>

      <button onClick={save} disabled={saving} className="neon-button mt-4">
        {saving ? "Saving…" : "Save Changes"}
      </button>
    </div>
  );
}
