import { SlashCommandBuilder } from "discord.js";
import { raidListEmbed, raidTargets } from "../../modules/stream/friends";
import type { CommandModule } from "../types";

// /raidlist: friends and members who are live right now, smallest first.
const command: CommandModule = {
  moduleKey: "STREAM_GROWTH",
  data: new SlashCommandBuilder().setName("raidlist").setDescription("See who's live right now to raid").setDMPermission(false) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.guildId) return;
    const targets = await raidTargets(interaction.guildId);
    await interaction.reply({ embeds: [raidListEmbed(targets)], ephemeral: true });
  },
};

export default command;
