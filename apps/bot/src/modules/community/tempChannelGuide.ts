import { EmbedBuilder, type Guild } from "discord.js";
import type { TempChannelLobby } from "@prisma/client";
import { TEMP_GUIDE_DEFAULT } from "@spartacus/shared";
import { resolveSavedEmbed, buildSavedEmbedPayload } from "../../lib/savedEmbedRender";

// The guide's placeholders. Channel mentions show blank in private replies,
// so channels become links.
function guideTokens(guild: Guild, lobby: TempChannelLobby) {
  const link = (id: string | null, fallback: string) => {
    const channel = id ? guild.channels.cache.get(id) : null;
    return channel ? `[${channel.isVoiceBased() ? "🔊 " : "#"}${channel.name}](https://discord.com/channels/${guild.id}/${channel.id})` : fallback;
  };
  return {
    link,
    tokens: {
      "{lobby}": link(lobby.joinToCreate ? lobby.lobbyChannelId : null, "the Create a Squad voice channel"),
      "{panel}": link(lobby.panelChannelId, "the Create a Squad panel"),
      "{controls}":
        lobby.controlsWhere === "THREAD" && lobby.controlsChannelId
          ? `your private squad thread in ${link(lobby.controlsChannelId, "the squad threads channel")}, which only you are added to`
          : "your voice channel's chat (the 💬 next to the channel name)",
    } as Record<string, string>,
  };
}

// The private "How it works" guide from the panel and squad channel buttons.
export function tempGuideEmbed(guild: Guild, lobby: TempChannelLobby) {
  const { link, tokens } = guideTokens(guild, lobby);
  let text = lobby.panelGuide || TEMP_GUIDE_DEFAULT;
  for (const [k, v] of Object.entries(tokens)) text = text.split(k).join(v);
  text = text.replace(/<#(\d+)>/g, (m, id) => link(id, m));
  return new EmbedBuilder().setColor(lobby.panelColor).setTitle("❓ How Squad Channels Work").setDescription(text.slice(0, 4096));
}

// The guide as it's sent: one built in the dashboard (or a library embed), or the text one above.
export async function tempGuideEmbeds(guild: Guild, lobby: TempChannelLobby) {
  const saved = await resolveSavedEmbed(lobby.guideEmbedId);
  if (saved) {
    const built = await buildSavedEmbedPayload(guild.id, saved, guideTokens(guild, lobby).tokens);
    if (built.embeds?.length) return built.embeds;
  }
  return [tempGuideEmbed(guild, lobby)];
}
