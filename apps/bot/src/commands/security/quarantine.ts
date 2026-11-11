import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { prisma } from "../../lib/prisma";
import { moderationBlock } from "../../lib/moderationGuard";
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

    const blocked = await moderationBlock(interaction, member);
    if (blocked) {
      await interaction.reply({ content: blocked, ephemeral: true });
      return;
    }

    // A second record would store no roles and /release would restore that one.
    const active = await prisma.quarantineRecord.findFirst({ where: { guildId: interaction.guildId as string, userId: user.id, active: true } });
    if (active) {
      await interaction.reply({ content: "This member is already quarantined.", ephemeral: true });
      return;
    }

    // Booster and integration roles can't be removed, and including one fails the whole change.
    const managed = member.roles.cache.filter((r) => r.managed).map((r) => r.id);
    const roleIds = member.roles.cache.filter((r) => r.id !== interaction.guild?.roles.everyone.id && !r.managed).map((r) => r.id);

    const stripped = await member.roles.set(managed).then(
      () => true,
      () => false
    );
    if (!stripped) {
      await interaction.reply({ content: "I couldn't remove their roles. Drag my role above theirs.", ephemeral: true });
      return;
    }

    await prisma.quarantineRecord.create({
      data: {
        guildId: interaction.guildId as string,
        userId: user.id,
        reason,
        quarantinedBy: interaction.user.id,
        previousRoles: roleIds,
      },
    });

    await interaction.reply(`⚠️ Quarantined **${user.tag}** — ${reason}. Use /release to restore their roles.`);
  },
};

export default command;
