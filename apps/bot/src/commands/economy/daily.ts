import { SlashCommandBuilder } from "discord.js";
import type { CommandModule } from "../types";
import { runDaily } from "../../modules/economy/dailyRewards";

const command: CommandModule = {
  moduleKey: "ECONOMY",
  data: new SlashCommandBuilder().setName("daily").setDescription("Claim your daily coin reward") as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.guildId) return;
    const r = await runDaily(interaction.client, interaction.guildId, interaction.user.id, interaction.channelId);
    await interaction.reply({ content: r.content, ephemeral: !r.ok });
  },
};

export default command;
