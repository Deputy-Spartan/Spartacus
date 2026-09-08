import { SlashCommandBuilder } from "discord.js";
import { prisma } from "../../lib/prisma";
import { addBalance, getConfig } from "../../lib/economy";
import type { CommandModule } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;

const command: CommandModule = {
  moduleKey: "ECONOMY",
  data: new SlashCommandBuilder().setName("daily").setDescription("Claim your daily coin reward") as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.guildId) return;
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    const config = await getConfig(guildId);
    const row = await prisma.economyBalance.findUnique({ where: { guildId_userId: { guildId, userId } } });

    if (row?.lastDailyClaim && Date.now() - row.lastDailyClaim.getTime() < DAY_MS) {
      const remainingMs = DAY_MS - (Date.now() - row.lastDailyClaim.getTime());
      const hours = Math.ceil(remainingMs / (60 * 60 * 1000));
      await interaction.reply({ content: `You've already claimed today. Try again in ~${hours}h.`, ephemeral: true });
      return;
    }

    await addBalance(guildId, userId, config.dailyAmount);
    await prisma.economyBalance.update({ where: { guildId_userId: { guildId, userId } }, data: { lastDailyClaim: new Date() } });

    await interaction.reply(`${config.currencyIcon} You claimed your daily **${config.dailyAmount} ${config.currencyName}**!`);
  },
};

export default command;
