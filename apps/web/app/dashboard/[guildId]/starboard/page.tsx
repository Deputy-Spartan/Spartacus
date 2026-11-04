"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { api, type StarboardConfig } from "../../../../lib/api";
import { useAutoSave } from "../../../../lib/useAutoSave";
import { SaveStatus } from "../../../../components/ui/SaveStatus";
import { DiscordButton, DiscordButtonRow, DiscordEmbed, DiscordMessage } from "../../../../components/ui/DiscordPreview";

const starEmoji = (n: number) => (n >= 20 ? "✨" : n >= 10 ? "💫" : n >= 5 ? "🌟" : "⭐");
// A stand-in for the starred image or GIF.
const SAMPLE_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400\" height=\"225\"><defs><linearGradient id=\"g\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#3b2a5c\"/><stop offset=\"1\" stop-color=\"#1e3a5f\"/></linearGradient></defs><rect width=\"400\" height=\"225\" fill=\"url(#g)\"/><text x=\"200\" y=\"120\" font-family=\"sans-serif\" font-size=\"20\" fill=\"#dbdee1\" text-anchor=\"middle\">The image or GIF shows here</text></svg>",
  );
const SAMPLE = { channels: { "100000000000000001": { name: "💬 | general-chat", voice: false } } };

export default function StarboardPage({ params }: { params: { guildId: string } }) {
  const [config, setConfig] = useState<StarboardConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getStarboard(params.guildId).then(setConfig);
  }, [params.guildId]);

  async function save() {
    if (!config) return;
    setSaving(true);
    setConfig(await api.setStarboard(params.guildId, config));
    setSaving(false);
  }

  const autoSave = useAutoSave(config, save);

  if (!config) return <p className="text-slate-400">Loading…</p>;

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="STARBOARD"
        title="Starboard"
        description="Any message that hits the ⭐ threshold gets reposted here automatically, and stays updated as more people star it."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      <NeonCard>
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Starboard Channel</label>
        <ChannelSelect
          guildId={params.guildId}
          value={config.channelId}
          onChange={(channelId) => setConfig({ ...config, channelId })}
        />

        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">⭐ Threshold</label>
        <input
          type="number"
          min={1}
          className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
          value={config.threshold}
          onChange={(e) => setConfig({ ...config, threshold: Number(e.target.value) })}
        />
        <p className="text-xs text-slate-500 mt-3">
          Images, GIFs and stickers show in the post. Replies show what they replied to. The count goes up and down as people add or remove ⭐, and the star grows at 5, 10 and 20.
        </p>
      </NeonCard>

      <NeonCard>
        <p className="font-medium mb-3">Preview</p>
        <DiscordMessage content={`${starEmoji(config.threshold || 1)} **${config.threshold || 1}** · <#100000000000000001>`} names={SAMPLE}>
          <DiscordEmbed
            color="#fbbf24"
            author="underscorebro"
            description="this clutch was actually insane 😭"
            imageUrl={SAMPLE_IMAGE}
            fields={[{ name: "↩️ Replying to CrustyButterNutz", value: "[bet you can't 1v4 this round](https://discord.com)" }]}
            timestamp
          />
          <DiscordButtonRow>
            <DiscordButton label="Jump to message" style="link" />
          </DiscordButtonRow>
        </DiscordMessage>
      </NeonCard>
      </div>

      <button onClick={save} disabled={saving} className="neon-button mt-4">
        {saving ? "Saving…" : "Save Changes"}
      </button>
      <SaveStatus status={autoSave} />
    </div>
  );
}
