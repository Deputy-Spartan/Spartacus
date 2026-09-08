import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { prisma } from "../../lib/prisma";
import type { CommandModule } from "../types";

const command: CommandModule = {
  moduleKey: "QUARANTINE",
  data: new SlashCommandBuilder()
    .setName("quarantine")
    .setDescription("Strip a member's roles and isolate them pending review")
    .addUserOption((o) => o.setName("user").setDescription("Member to quarantine").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for quarantine"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers) as SlashCommandBuilder,

  async execute(interaction) {
    const user = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided";

    const member = await interaction.guild?.members.fetch(user.id).catch(() => null);
    if (!member) {
      await interaction.reply({ content: "Could not find that member.", ephemeral: true });
      return;
    }

    const roleIds = member.roles.cache.filter((r) => r.id !== interaction.guild?.roles.everyone.id).map((r) => r.id);

    await prisma.quarantineRecord.create({
      data: {
        guildId: interaction.guildId as string,
        userId: user.id,
        reason,
        quarantinedBy: interaction.user.id,
        previousRoles: roleIds,
      },
    });

    await member.roles.set([]).catch(() => null);
    await interaction.reply(`⚠️ Quarantined **${user.tag}** — ${reason}. Use /release to restore their roles.`);
  },
};

export default command;
