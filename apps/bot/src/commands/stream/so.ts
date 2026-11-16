import { SlashCommandBuilder } from "discord.js";
import type { LivePlatform } from "@spartacus/shared";
import { shoutoutCard } from "../../modules/stream/friends";
import type { CommandModule } from "../types";

// /so: a shoutout card for another streamer, posted for everyone to see.
const command: CommandModule = {
  moduleKey: "STREAM_GROWTH",
  data: new SlashCommandBuilder()
    .setName("so")
    .setDescription("Give a streamer a shoutout")
    .setDMPermission(false)
    .addStringOption((o) => o.setName("name").setDescription("Their channel name or link").setRequired(true).setMaxLength(100))
    .addStringOption((o) =>
      o
        .setName("platform")
        .setDescription("Where they stream (leave empty to look it up)")
        .addChoices({ name: "🟣 Twitch", value: "twitch" }, { name: "🟢 Kick", value: "kick" }, { name: "🔴 YouTube", value: "youtube" }, { name: "🎵 TikTok", value: "tiktok" }),
    ) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.guildId) return;
    await interaction.deferReply();
    const card = await shoutoutCard(interaction.guildId, interaction.options.getString("name", true), (interaction.options.getString("platform") as LivePlatform | null) ?? null);
    if (!card) {
      await interaction.editReply("I couldn't find that channel. Check the name, or pick the platform.");
      return;
    }
    await interaction.editReply({ embeds: [card.embed], components: [card.row], allowedMentions: { parse: [] } });
  },
};

export default command;
