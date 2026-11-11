import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandModule } from "../types";
import { logCase } from "../../lib/cases";
import { moderationBlock } from "../../lib/moderationGuard";

const command: CommandModule = {
  moduleKey: "MODERATION",
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a member")
    .addUserOption((o) => o.setName("user").setDescription("Member to warn").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for the warning").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers) as SlashCommandBuilder,

  async execute(interaction) {
    const user = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason", true);

    const member = await interaction.guild?.members.fetch(user.id).catch(() => null);
    const blocked = member ? await moderationBlock(interaction, member) : null;
    if (blocked) {
      await interaction.reply({ content: blocked, ephemeral: true });
      return;
    }

    const caseRow = await logCase({
      guildId: interaction.guildId as string,
      userId: user.id,
      action: "WARN",
      reason,
      moderatorId: interaction.user.id,
      client: interaction.client,
    });

    await user.send(`You were warned in **${interaction.guild?.name}**: ${reason}`).catch(() => null);
    await interaction.reply(`⚠️ Warned **${user.tag}** — ${reason} (case #${caseRow.caseNumber})`);
  },
};

export default command;
