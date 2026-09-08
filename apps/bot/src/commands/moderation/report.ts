import { SlashCommandBuilder } from "discord.js";
import { prisma } from "../../lib/prisma";
import type { CommandModule } from "../types";

const command: CommandModule = {
  moduleKey: "PLAYER_REPORTS",
  data: new SlashCommandBuilder()
    .setName("report")
    .setDescription("Privately report a member to staff")
    .addUserOption((o) => o.setName("user").setDescription("Member you're reporting").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("What happened").setRequired(true)) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.guildId) return;
    const reported = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason", true);

    const report = await prisma.playerReport.create({
      data: {
        guildId: interaction.guildId,
        reporterId: interaction.user.id,
        reportedUserId: reported.id,
        reason,
      },
    });

    await interaction.reply({
      content: `✅ Report submitted (#${report.id.slice(0, 8)}). Staff will review it.`,
      ephemeral: true,
    });
  },
};

export default command;
