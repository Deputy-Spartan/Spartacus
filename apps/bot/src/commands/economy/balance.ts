import { SlashCommandBuilder } from "discord.js";
import { getBalance, getConfig } from "../../lib/economy";
import type { CommandModule } from "../types";

const command: CommandModule = {
  moduleKey: "ECONOMY",
  data: new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your (or someone else's) coin balance")
    .addUserOption((o) => o.setName("user").setDescription("Member to check")) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.guildId) return;
    const target = interaction.options.getUser("user") ?? interaction.user;
    const [balance, config] = await Promise.all([getBalance(interaction.guildId, target.id), getConfig(interaction.guildId)]);

    await interaction.reply(`${config.currencyIcon} **${target.username}** has **${balance.toLocaleString()} ${config.currencyName}**.`);
  },
};

export default command;
