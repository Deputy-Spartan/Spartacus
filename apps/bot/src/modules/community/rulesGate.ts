import { ButtonInteraction, EmbedBuilder } from "discord.js";
import { prisma } from "../../lib/prisma";
import { logError } from "@spartacus/db";

const DEFAULT_DM_CONFIRM = "✅ Thanks for agreeing to the rules in **{server}** — you now have access!";
const DEFAULT_AGREE_REPLY = "✅ Thanks — you now have access!";
const DEFAULT_ALREADY_AGREED = "You've already agreed!";
const DEFAULT_NO_ROLE_CONFIGURED = "This server hasn't configured a role to grant yet — ask an admin to set one up.";

function renderMessage(template: string | null | undefined, fallback: string, guildName: string) {
  return (template || fallback).replace(/\{server\}/g, guildName);
}

// Handles a click on the "✅ I Agree" button posted by the rules gate poster
// job (apps/bot/src/jobs/rulesGatePoster.ts). Grants the configured role,
// optionally strips a pre-verification role, logs it, and optionally DMs.
export async function handleRulesGateAgree(interaction: ButtonInteraction, settingsId: string) {
  const settings = await prisma.rulesGateSettings.findUnique({ where: { id: settingsId } });
  if (!settings) {
    await interaction.reply({ content: "⚠️ This rules gate is no longer configured.", ephemeral: true });
    return;
  }

  if (!interaction.guild) return;

  if (!settings.roleId) {
    await interaction.reply({
      content: renderMessage(settings.noRoleConfiguredMessage, DEFAULT_NO_ROLE_CONFIGURED, interaction.guild.name),
      ephemeral: true,
    });
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await interaction.reply({ content: "⚠️ Couldn't find your membership in this server.", ephemeral: true });
    return;
  }

  if (member.roles.cache.has(settings.roleId)) {
    await interaction.reply({ content: renderMessage(settings.alreadyAgreedMessage, DEFAULT_ALREADY_AGREED, interaction.guild.name), ephemeral: true });
    return;
  }

  try {
    await member.roles.add(settings.roleId);
    if (settings.roleToRemoveId && member.roles.cache.has(settings.roleToRemoveId)) {
      await member.roles.remove(settings.roleToRemoveId).catch(() => null);
    }
  } catch (err) {
    logError("bot", err, interaction.guildId ?? undefined);
    await interaction.reply({
      content: "⚠️ I don't have permission to assign that role — ask an admin to move my role above it in Settings → Roles.",
      ephemeral: true,
    });
    return;
  }

  await prisma.rulesGateSettings.update({ where: { id: settings.id }, data: { agreedCount: { increment: 1 } } });

  await interaction.reply({ content: renderMessage(settings.agreeReplyMessage, DEFAULT_AGREE_REPLY, interaction.guild.name), ephemeral: true });

  if (settings.logChannelId) {
    const logChannel = await interaction.guild.channels.fetch(settings.logChannelId).catch(() => null);
    if (logChannel?.isTextBased()) {
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setDescription(`✅ <@${member.id}> agreed to the rules and was granted <@&${settings.roleId}>.`)
        .setTimestamp();
      await logChannel.send({ embeds: [embed] }).catch(() => null);
    }
  }

  if (settings.dmConfirmEnabled) {
    await member.send(renderMessage(settings.dmConfirmMessage, DEFAULT_DM_CONFIRM, interaction.guild.name)).catch(() => null);
  }
}
