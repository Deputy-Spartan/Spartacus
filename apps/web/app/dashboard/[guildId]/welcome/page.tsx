"use client";

import { useEffect, useRef, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { EmbedExtraFields } from "../../../../components/ui/EmbedExtraFields";
import { StickyPreview } from "../../../../components/ui/StickyPreview";
import { PlaceholderExamples } from "../../../../components/ui/PlaceholderExamples";
import { EMPTY_EMBED_EXTRA } from "../../../../lib/embedExtra";
import { api, type WelcomeConfig } from "../../../../lib/api";
import { useAutoSave } from "../../../../lib/useAutoSave";
import { SaveStatus } from "../../../../components/ui/SaveStatus";

const WELCOME_TOKENS = [
  { token: "{user}", description: "Mentions the member who joined or left" },
  { token: "{server}", description: "The server's name" },
];

const COLOR_PRESETS = ["#00E5FF", "#5865F2", "#7CB88F", "#D8AE6B", "#C77B7B", "#B98AD1"];

export default function WelcomePage({ params }: { params: { guildId: string } }) {
  const [config, setConfig] = useState<WelcomeConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const welcomeRef = useRef<HTMLTextAreaElement>(null);
  const goodbyeRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.getWelcome(params.guildId).then(setConfig);
  }, [params.guildId]);

  async function save() {
    if (!config) return;
    setSaving(true);
    // savedEmbedId has no UI on this page anymore (the inline embed builder
    // below replaces it) — clearing it here migrates any older guild that
    // still had one set off it, so the inline fields above actually apply.
    const saved = await api.setWelcome(params.guildId, { ...config, savedEmbedId: null });
    setConfig(saved);
    setSaving(false);
  }

  const autoSave = useAutoSave(config, save);

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
            ref={welcomeRef}
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm min-h-20 focus:outline-none focus:ring-1 focus:ring-neon-blue"
            value={config.welcomeText}
            onChange={(e) => setConfig({ ...config, welcomeText: e.target.value })}
          />
          <PlaceholderExamples items={WELCOME_TOKENS} inputRef={welcomeRef} value={config.welcomeText} onChange={(v) => setConfig({ ...config, welcomeText: v })} />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Goodbye Message</label>
          <textarea
            ref={goodbyeRef}
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm min-h-20 focus:outline-none focus:ring-1 focus:ring-neon-blue"
            value={config.goodbyeText}
            onChange={(e) => setConfig({ ...config, goodbyeText: e.target.value })}
          />
          <PlaceholderExamples items={WELCOME_TOKENS} inputRef={goodbyeRef} value={config.goodbyeText} onChange={(v) => setConfig({ ...config, goodbyeText: v })} />

          <div className="flex items-center justify-between mb-3 rounded-lg border border-white/10 bg-base-950 px-3 py-2.5 mt-4">
            <div>
              <p className="text-sm font-medium">Send as Embed</p>
              <p className="text-xs text-slate-500">
                One or the other, never both — off sends the plain text above, on wraps it in a colored embed card instead. Shared by both Welcome and
                Goodbye.
              </p>
            </div>
            <ToggleSwitch enabled={config.embedEnabled} onChange={(v) => setConfig({ ...config, embedEnabled: v })} label="Send as embed" />
          </div>

          {config.embedEnabled && (
            <>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Embed Title (optional)</label>
              <input
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
                value={config.embedTitle ?? ""}
                onChange={(e) => setConfig({ ...config, embedTitle: e.target.value })}
                placeholder="👋 Welcome!"
              />

              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Embed Color</label>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="color"
                  className="h-9 w-11 rounded-lg border border-white/10 bg-base-950 cursor-pointer shrink-0"
                  value={config.embedColor}
                  onChange={(e) => setConfig({ ...config, embedColor: e.target.value })}
                />
                <input
                  className="flex-1 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm font-mono"
                  value={config.embedColor}
                  onChange={(e) => setConfig({ ...config, embedColor: e.target.value })}
                />
              </div>
              <div className="flex gap-1.5 mb-4">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    onClick={() => setConfig({ ...config, embedColor: c })}
                    className="w-[18px] h-[18px] rounded border border-white/10 hover:scale-110 transition-transform"
                    style={{ background: c }}
                  />
                ))}
              </div>

              <EmbedExtraFields
                guildId={params.guildId}
                value={config.embedExtra ?? EMPTY_EMBED_EXTRA}
                onChange={(v) => setConfig({ ...config, embedExtra: v })}
              />
            </>
          )}
        </NeonCard>

        <NeonCard>
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-3">Live Preview (Welcome)</p>
          <StickyPreview
            content={config.embedEnabled ? "" : previewText}
            embedEnabled={config.embedEnabled}
            embedTitle={config.embedTitle ?? ""}
            embedDescription={previewText}
            embedColor={config.embedColor}
            buttons={[]}
            embedExtra={config.embedExtra ?? {}}
          />
        </NeonCard>
      </div>

      <button onClick={save} disabled={saving} className="neon-button mt-4">
        {saving ? "Saving…" : "Save Changes"}
      </button>
      <SaveStatus status={autoSave} />
    </div>
  );
}
