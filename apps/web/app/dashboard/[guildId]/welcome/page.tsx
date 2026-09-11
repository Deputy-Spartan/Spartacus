"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { EmbedFields } from "../../../../components/ui/EmbedFields";
import { EmbedExtraFields } from "../../../../components/ui/EmbedExtraFields";
import { StickyPreview } from "../../../../components/ui/StickyPreview";
import { SavedEmbedPicker } from "../../../../components/embedCreator/SavedEmbedPicker";
import { api, type WelcomeConfig } from "../../../../lib/api";

export default function WelcomePage({ params }: { params: { guildId: string } }) {
  const [config, setConfig] = useState<WelcomeConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getWelcome(params.guildId).then(setConfig);
  }, [params.guildId]);

  async function save() {
    if (!config) return;
    setSaving(true);
    const saved = await api.setWelcome(params.guildId, config);
    setConfig(saved);
    setSaving(false);
  }

  if (!config) return <p className="text-slate-400">Loading…</p>;

  const previewText = config.welcomeText.replace("{server}", "Iron Legion").replace("{user}", "@Draven");

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="WELCOME"
        title="Welcome & Goodbye"
        description={
          <>
            Use <code className="text-neon-blue">{"{user}"}</code> and{" "}
            <code className="text-neon-blue">{"{server}"}</code> as placeholders.
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <NeonCard>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Welcome Channel</label>
          <ChannelSelect
            guildId={params.guildId}
            value={config.channelId}
            onChange={(channelId) => setConfig({ ...config, channelId })}
            placeholder="Select a channel…"
          />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Welcome Message</label>
          <textarea
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm min-h-20 mb-4 focus:outline-none focus:ring-1 focus:ring-neon-blue"
            value={config.welcomeText}
            onChange={(e) => setConfig({ ...config, welcomeText: e.target.value })}
          />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Goodbye Message</label>
          <textarea
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm min-h-20 mb-4 focus:outline-none focus:ring-1 focus:ring-neon-blue"
            value={config.goodbyeText}
            onChange={(e) => setConfig({ ...config, goodbyeText: e.target.value })}
          />

          <EmbedFields
            guildId={params.guildId}
            embedEnabled={config.embedEnabled}
            embedTitle={config.embedTitle ?? ""}
            embedColor={config.embedColor}
            buttons={config.buttons}
            onChange={(next) => setConfig({ ...config, ...next })}
          />

          <EmbedExtraFields
            value={config.embedExtra ?? {}}
            onChange={(v) => setConfig({ ...config, embedExtra: v })}
          />

          <SavedEmbedPicker
            guildId={params.guildId}
            value={config.savedEmbedId ?? null}
            onChange={(id) => setConfig({ ...config, savedEmbedId: id })}
          />
        </NeonCard>

        <NeonCard>
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-3">Live Preview (Welcome)</p>
          {config.savedEmbedId && (
            <p className="text-xs text-slate-600 mb-3">Preview reflects the saved embed once sent.</p>
          )}
          <StickyPreview
            content={previewText}
            embedEnabled={config.embedEnabled}
            embedTitle={config.embedTitle ?? ""}
            embedDescription={previewText}
            embedColor={config.embedColor}
            buttons={config.buttons}
            embedExtra={config.embedExtra}
          />
        </NeonCard>
      </div>

      <button onClick={save} disabled={saving} className="neon-button mt-4">
        {saving ? "Saving…" : "Save Changes"}
      </button>
    </div>
  );
}
