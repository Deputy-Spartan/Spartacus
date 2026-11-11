import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { prisma } from "../../lib/prisma";
import { assignableRoleIds } from "../../lib/memberRoles";
import type { CommandModule } from "../types";

const command: CommandModule = {
  moduleKey: "QUARANTINE",
  data: new SlashCommandBuilder()
    .setName("release")
    .setDescription("Release a member from quarantine and restore their roles")
    .addUserOption((o) => o.setName("user").setDescription("Member to release").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers) as SlashCommandBuilder,

  async execute(interaction) {
    const user = interaction.options.getUser("user", true);

    const record = await prisma.quarantineRecord.findFirst({
      where: { guildId: interaction.guildId as string, userId: user.id, active: true },
      orderBy: { createdAt: "desc" },
    });
    if (!record) {
      await interaction.reply({ content: "This member isn't currently quarantined.", ephemeral: true });
      return;
    }

    const member = await interaction.guild?.members.fetch(user.id).catch(() => null);
    const restored = member ? await member.roles.add(assignableRoleIds(member.guild, record.previousRoles)).then(
      () => true,
      () => false
    ) : true;
    if (!restored) {
      await interaction.reply({ content: "I couldn't restore their roles. Drag my role above them and try again.", ephemeral: true });
      return;
    }
    await prisma.quarantineRecord.update({ where: { id: record.id }, data: { active: false } });

    await interaction.reply(`✅ Released **${user.tag}** and restored their previous roles.`);
  },
};

export default command;
