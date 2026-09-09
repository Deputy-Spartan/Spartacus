import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { getConfig } from "../../lib/economy";
import { prisma } from "../../lib/prisma";
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
    const guildId = interaction.guildId;

    const [row, config, rankAbove] = await Promise.all([
      prisma.economyBalance.findUnique({ where: { guildId_userId: { guildId, userId: target.id } } }),
      getConfig(guildId),
      prisma.economyBalance.count({ where: { guildId } }),
    ]);

    const balance = row?.balance ?? 0;
    const higherCount = await prisma.economyBalance.count({ where: { guildId, balance: { gt: balance } } });
    const rank = rankAbove === 0 ? "—" : `#${higherCount + 1}`;

    const embed = new EmbedBuilder()
      .setColor((config.embedColor as `#${string}`) || "#E8C547")
      .setAuthor({ name: target.username, iconURL: target.displayAvatarURL() })
      .addFields(
        { name: "Wallet", value: `${balance.toLocaleString()} ${config.currencyIcon} ${config.currencyName}` },
        { name: "Earned", value: (row?.totalEarned ?? 0).toLocaleString(), inline: true },
        { name: "Spent", value: (row?.totalSpent ?? 0).toLocaleString(), inline: true },
        { name: "Rank", value: rank, inline: true }
      );

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
