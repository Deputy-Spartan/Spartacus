import { ButtonInteraction } from "discord.js";
import { prisma } from "../../lib/prisma";
import { logError } from "@spartacus/db";

// Handles a click on the "✅ I Agree" button posted by the rules gate poster
// job (apps/bot/src/jobs/rulesGatePoster.ts). Grants the configured role.
export async function handleRulesGateAgree(interaction: ButtonInteraction, settingsId: string) {
  const settings = await prisma.rulesGateSettings.findUnique({ where: { id: settingsId } });
  if (!settings) {
    await interaction.reply({ content: "⚠️ This rules gate is no longer configured.", ephemeral: true });
    return;
  }

  if (!settings.roleId) {
    await interaction.reply({
      content: "This server hasn't configured a role to grant yet — ask an admin to set one up.",
      ephemeral: true,
    });
    return;
  }

  if (!interaction.guild) return;

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await interaction.reply({ content: "⚠️ Couldn't find your membership in this server.", ephemeral: true });
    return;
  }

  if (member.roles.cache.has(settings.roleId)) {
    await interaction.reply({ content: "You've already agreed!", ephemeral: true });
    return;
  }

  try {
    await member.roles.add(settings.roleId);
  } catch (err) {
    logError("bot", err, interaction.guildId ?? undefined);
    await interaction.reply({
      content: "⚠️ I don't have permission to assign that role — ask an admin to move my role above it in Settings → Roles.",
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({ content: "✅ Thanks — you now have access!", ephemeral: true });
}
