import { SlashCommandBuilder } from "discord.js";
import type { CommandModule } from "../types";
import { prisma } from "../../lib/prisma";

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // Feb allows the 29th year-round for simplicity

const command: CommandModule = {
  moduleKey: "BIRTHDAYS",
  data: new SlashCommandBuilder()
    .setName("birthday")
    .setDescription("Manage your birthday")
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Set your birthday")
        .addIntegerOption((o) => o.setName("month").setDescription("1-12").setRequired(true).setMinValue(1).setMaxValue(12))
        .addIntegerOption((o) => o.setName("day").setDescription("1-31").setRequired(true).setMinValue(1).setMaxValue(31))
    )
    .addSubcommand((sub) => sub.setName("remove").setDescription("Remove your saved birthday"))
    .addSubcommand((sub) => sub.setName("view").setDescription("View your saved birthday")) as SlashCommandBuilder,

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId as string;

    if (sub === "set") {
      const month = interaction.options.getInteger("month", true);
      const day = interaction.options.getInteger("day", true);

      if (day > DAYS_IN_MONTH[month - 1]) {
        await interaction.reply({ content: `That month doesn't have a day ${day}.`, ephemeral: true });
        return;
      }

      await prisma.birthday.upsert({
        where: { guildId_userId: { guildId, userId: interaction.user.id } },
        create: { guildId, userId: interaction.user.id, month, day },
        update: { month, day },
      });
      await interaction.reply({ content: `🎂 Saved your birthday as **${month}/${day}**.`, ephemeral: true });
      return;
    }

    if (sub === "remove") {
      await prisma.birthday.deleteMany({ where: { guildId, userId: interaction.user.id } });
      await interaction.reply({ content: "Removed your saved birthday.", ephemeral: true });
      return;
    }

    const existing = await prisma.birthday.findUnique({ where: { guildId_userId: { guildId, userId: interaction.user.id } } });
    await interaction.reply({
      content: existing ? `Your saved birthday is **${existing.month}/${existing.day}**.` : "You haven't set a birthday yet — try `/birthday set`.",
      ephemeral: true,
    });
  },
};

export default command;
