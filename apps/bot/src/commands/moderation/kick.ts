import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandModule } from "../types";
import { logCase } from "../../lib/cases";

const command: CommandModule = {
  moduleKey: "MODERATION",
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member from this server")
    .addUserOption((o) => o.setName("user").setDescription("Member to kick").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for the kick"))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers) as SlashCommandBuilder,

  async execute(interaction) {
    const user = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided";

    const member = await interaction.guild?.members.fetch(user.id).catch(() => null);
    if (!member) {
      await interaction.reply({ content: "Could not find that member.", ephemeral: true });
      return;
    }

    await member.kick(reason);
    await logCase({
      guildId: interaction.guildId as string,
      userId: user.id,
      action: "KICK",
      reason,
      moderatorId: interaction.user.id,
    });
    await interaction.reply(`👢 Kicked **${user.tag}** — ${reason}`);
  },
};

export default command;
