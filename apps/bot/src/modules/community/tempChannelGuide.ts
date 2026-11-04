import { EmbedBuilder, type Guild } from "discord.js";
import type { TempChannelLobby } from "@prisma/client";
import { TEMP_GUIDE_DEFAULT } from "@spartacus/shared";

// The private "How it works" guide from the panel and squad channel buttons.
// Channel mentions show blank in private replies, so channels become links.
export function tempGuideEmbed(guild: Guild, lobby: TempChannelLobby) {
  const link = (id: string | null, fallback: string) => {
    const channel = id ? guild.channels.cache.get(id) : null;
    return channel ? `[${channel.isVoiceBased() ? "🔊 " : "#"}${channel.name}](https://discord.com/channels/${guild.id}/${channel.id})` : fallback;
  };
  const text = (lobby.panelGuide || TEMP_GUIDE_DEFAULT)
    .replace(/{lobby}/g, link(lobby.lobbyChannelId, "the Create a Squad voice channel"))
    .replace(/{panel}/g, link(lobby.panelChannelId, "the Create a Squad panel"))
    .replace(/<#(\d+)>/g, (m, id) => link(id, m));
  return new EmbedBuilder().setColor(lobby.panelColor).setTitle("❓ How Squad Channels Work").setDescription(text.slice(0, 4096));
}
