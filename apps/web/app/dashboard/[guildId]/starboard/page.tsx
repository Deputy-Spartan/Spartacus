"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { api, type StarboardConfig } from "../../../../lib/api";
import { useAutoSave } from "../../../../lib/useAutoSave";
import { SaveStatus } from "../../../../components/ui/SaveStatus";
import { NumberInput, SettingRow, SettingsSection } from "../../../../components/ui/Settings";
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

  useEffect(() => {
    api.getStarboard(params.guildId).then(setConfig);
  }, [params.guildId]);

  async function save() {
    if (!config) return;
    setConfig(await api.setStarboard(params.guildId, config));
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

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-4 items-start">
      <div>
        <SettingsSection title="Where it posts">
          <SettingRow label="Starboard channel" required help="Starred posts are copied here." tip="Members should be able to read this channel but not type in it, so it stays a clean hall of fame.">
            <ChannelSelect guildId={params.guildId} value={config.channelId} onChange={(channelId) => setConfig({ ...config, channelId })} />
          </SettingRow>
        </SettingsSection>
        <SettingsSection title="Rules">
          <SettingRow label="Stars needed" help="How many ⭐ a message needs to be posted." tip="Images, GIFs and stickers show in the post, replies show what they replied to, and the count keeps updating as people add or remove ⭐. The star grows at 5, 10 and 20.">
            <NumberInput label="Stars needed" value={config.threshold} onChange={(n) => setConfig({ ...config, threshold: n })} min={1} />
          </SettingRow>
        </SettingsSection>
      </div>

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

      <SaveStatus status={autoSave} onSave={save} />
    </div>
  );
}
