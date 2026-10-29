import { SlashCommandBuilder } from "discord.js";
import { createPlayerReport } from "../../modules/moderation/playerReports";
import type { CommandModule } from "../types";

const command: CommandModule = {
  moduleKey: "PLAYER_REPORTS",
  data: new SlashCommandBuilder()
    .setName("report")
    .setDescription("Privately report a member to staff")
    .addUserOption((o) => o.setName("user").setDescription("Member you're reporting").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("What happened").setRequired(true)) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.guildId || !interaction.guild) return;
    const reported = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason", true);

    if (reported.id === interaction.user.id) {
      await interaction.reply({ content: "⚠️ You can't report yourself.", ephemeral: true });
      return;
    }
    if (reported.bot) {
      await interaction.reply({ content: "⚠️ You can't report a bot.", ephemeral: true });
      return;
    }

    const result = await createPlayerReport(interaction.client, interaction.guild, interaction.user.id, reported.id, reason);
    if (!result.ok) {
      await interaction.reply({ content: `⚠️ ${result.error}`, ephemeral: true });
      return;
    }

    await interaction.reply({
      content: `✅ Report submitted privately (#${result.report.reportNumber}). Staff will review it — check your DMs for updates.`,
      ephemeral: true,
    });
  },
};

export default command;
