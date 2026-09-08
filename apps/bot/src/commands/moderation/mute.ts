import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandModule } from "../types";
import { logCase } from "../../lib/cases";

const command: CommandModule = {
  moduleKey: "MODERATION",
  data: new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Timeout a member")
    .addUserOption((o) => o.setName("user").setDescription("Member to mute").setRequired(true))
    .addIntegerOption((o) =>
      o.setName("minutes").setDescription("Duration in minutes").setRequired(true).setMinValue(1).setMaxValue(40320)
    )
    .addStringOption((o) => o.setName("reason").setDescription("Reason for the mute"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers) as SlashCommandBuilder,

  async execute(interaction) {
    const user = interaction.options.getUser("user", true);
    const minutes = interaction.options.getInteger("minutes", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided";

    const member = await interaction.guild?.members.fetch(user.id).catch(() => null);
    if (!member) {
      await interaction.reply({ content: "Could not find that member.", ephemeral: true });
      return;
    }

    await member.timeout(minutes * 60 * 1000, reason);
    await logCase({
      guildId: interaction.guildId as string,
      userId: user.id,
      action: "MUTE",
      reason: `${reason} (${minutes}m)`,
      moderatorId: interaction.user.id,
    });
    await interaction.reply(`🔇 Muted **${user.tag}** for ${minutes} minute(s) — ${reason}`);
  },
};

export default command;
