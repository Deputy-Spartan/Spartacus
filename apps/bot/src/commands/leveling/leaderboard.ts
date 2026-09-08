import { SlashCommandBuilder } from "discord.js";
import { prisma } from "../../lib/prisma";
import type { CommandModule } from "../types";

const command: CommandModule = {
  moduleKey: "LEVELING",
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show the top members by XP") as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.guildId) return;

    const top = await prisma.memberXp.findMany({
      where: { guildId: interaction.guildId },
      orderBy: { xp: "desc" },
      take: 10, // bounded — never pull the whole table into memory
    });

    if (top.length === 0) {
      await interaction.reply("No XP data yet for this server.");
      return;
    }

    const lines = await Promise.all(
      top.map(async (row, i) => {
        const member = await interaction.guild?.members.fetch(row.userId).catch(() => null);
        const name = member?.displayName ?? `<@${row.userId}>`;
        return `**${i + 1}.** ${name} — Level ${row.level} (${row.xp} XP)`;
      })
    );

    await interaction.reply(`🏆 **Leaderboard**\n${lines.join("\n")}`);
  },
};

export default command;
