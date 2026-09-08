import { SlashCommandBuilder } from "discord.js";
import { prisma } from "../../lib/prisma";
import type { CommandModule } from "../types";

const command: CommandModule = {
  moduleKey: "LEVELING",
  data: new SlashCommandBuilder().setName("rank").setDescription("Show your current level and XP") as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.guildId) return;

    const record = await prisma.memberXp.findUnique({
      where: { guildId_userId: { guildId: interaction.guildId, userId: interaction.user.id } },
    });

    if (!record) {
      await interaction.reply({ content: "You haven't earned any XP here yet.", ephemeral: true });
      return;
    }

    await interaction.reply(`📈 **${interaction.user.username}** — Level ${record.level} (${record.xp} XP)`);
  },
};

export default command;
