import { ButtonInteraction, Client, EmbedBuilder } from "discord.js";
import { prisma } from "../../lib/prisma";
import { logError } from "@spartacus/db";

const DEFAULT_DM_CONFIRM = "✅ Thanks for agreeing to the rules in **{server}** — you now have access!";
const DEFAULT_AGREE_REPLY = "✅ Thanks — you now have access!";
const DEFAULT_ALREADY_AGREED = "You've already agreed!";
const DEFAULT_NO_ROLE_CONFIGURED = "This server hasn't configured a role to grant yet — ask an admin to set one up.";
const DEFAULT_ACCOUNT_TOO_NEW = "Your Discord account is too new to agree to the rules in **{server}** yet — try again in a few days.";
const DEFAULT_DECLINE_REPLY_CHANNEL = "No worries — head to {channel} if you have questions about the rules before agreeing.";
const DEFAULT_DECLINE_REPLY_KICK = "Understood — you'll be removed from **{server}** since you don't agree to the rules.";
const DEFAULT_REMINDER = "👋 Just a reminder — you still need to agree to the rules in **{server}** to get full access. Head back to the server and click \"I Agree\".";

function renderMessage(template: string | null | undefined, fallback: string, tokens: Record<string, string>) {
  let out = template || fallback;
  for (const [key, value] of Object.entries(tokens)) out = out.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  return out;
}

// Cheap in-memory debounce so a double-click (or a retried interaction)
// can't double-DM/double-log someone or trigger two kicks in a row.
// Keyed per interaction customId+user, not persisted across restarts —
// the real idempotency (role already granted) still holds either way.
const recentClicks = new Map<string, number>();
const CLICK_COOLDOWN_MS = 3000;
function onCooldown(key: string) {
  const last = recentClicks.get(key);
  const now = Date.now();
  if (last && now - last < CLICK_COOLDOWN_MS) return true;
  recentClicks.set(key, now);
  if (recentClicks.size > 5000) recentClicks.clear();
  return false;
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
  if (onCooldown(`agree:${settings.id}:${interaction.user.id}`)) {
    await interaction.reply({ content: "Hang on — still processing your last click.", ephemeral: true });
    return;
  }

  if (!settings.roleId) {
    await interaction.reply({
      content: renderMessage(settings.noRoleConfiguredMessage, DEFAULT_NO_ROLE_CONFIGURED, { server: interaction.guild.name }),
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
    await interaction.reply({
      content: renderMessage(settings.alreadyAgreedMessage, DEFAULT_ALREADY_AGREED, { server: interaction.guild.name }),
      ephemeral: true,
    });
    return;
  }

  if (settings.minAccountAgeDays) {
    const ageDays = (Date.now() - member.user.createdTimestamp) / 86_400_000;
    if (ageDays < settings.minAccountAgeDays) {
      await interaction.reply({
        content: renderMessage(settings.accountTooNewMessage, DEFAULT_ACCOUNT_TOO_NEW, { server: interaction.guild.name }),
        ephemeral: true,
      });
      return;
    }
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

  await prisma.rulesGateAgreement.create({
    data: {
      settingsId: settings.id,
      guildId: interaction.guild.id,
      userId: member.id,
      username: member.user.tag,
      roleId: settings.roleId,
      version: settings.rulesVersion,
    },
  });
  await prisma.rulesGatePendingMember.deleteMany({ where: { guildId: interaction.guild.id, userId: member.id } }).catch(() => null);

  await interaction.reply({
    content: renderMessage(settings.agreeReplyMessage, DEFAULT_AGREE_REPLY, { server: interaction.guild.name }),
    ephemeral: true,
  });

  if (settings.logChannelId) {
    const logChannel = await interaction.guild.channels.fetch(settings.logChannelId).catch(() => null);
    if (logChannel?.isTextBased()) {
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setDescription(`✅ <@${member.id}> agreed to the rules (v${settings.rulesVersion}) and was granted <@&${settings.roleId}>.`)
        .setTimestamp();
      await logChannel.send({ embeds: [embed] }).catch(() => null);
    }
  }

  if (settings.dmConfirmEnabled) {
    await member.send(renderMessage(settings.dmConfirmMessage, DEFAULT_DM_CONFIRM, { server: interaction.guild.name })).catch(() => null);
  }
}

// Handles a click on an optional per-section button (e.g. "Trading Rules")
// — grants only that section's role, independent of the main Agree flow.
export async function handleRulesGateSection(interaction: ButtonInteraction, settingsId: string, sectionId: string) {
  const [settings, section] = await Promise.all([
    prisma.rulesGateSettings.findUnique({ where: { id: settingsId } }),
    prisma.rulesGateSection.findUnique({ where: { id: sectionId } }),
  ]);
  if (!settings || !section) {
    await interaction.reply({ content: "⚠️ This section is no longer configured.", ephemeral: true });
    return;
  }
  if (!interaction.guild) return;
  if (onCooldown(`section:${sectionId}:${interaction.user.id}`)) {
    await interaction.reply({ content: "Hang on — still processing your last click.", ephemeral: true });
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await interaction.reply({ content: "⚠️ Couldn't find your membership in this server.", ephemeral: true });
    return;
  }

  if (member.roles.cache.has(section.roleId)) {
    await interaction.reply({ content: `You've already acknowledged **${section.label}**!`, ephemeral: true });
    return;
  }

  try {
    await member.roles.add(section.roleId);
  } catch (err) {
    logError("bot", err, interaction.guildId ?? undefined);
    await interaction.reply({
      content: "⚠️ I don't have permission to assign that role — ask an admin to move my role above it in Settings → Roles.",
      ephemeral: true,
    });
    return;
  }

  await prisma.rulesGateAgreement.create({
    data: {
      settingsId: settings.id,
      guildId: interaction.guild.id,
      userId: member.id,
      username: member.user.tag,
      roleId: section.roleId,
      version: settings.rulesVersion,
      sectionId: section.id,
    },
  });

  await interaction.reply({ content: `✅ Acknowledged **${section.label}**.`, ephemeral: true });

  if (settings.logChannelId) {
    const logChannel = await interaction.guild.channels.fetch(settings.logChannelId).catch(() => null);
    if (logChannel?.isTextBased()) {
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setDescription(`✅ <@${member.id}> acknowledged **${section.label}** and was granted <@&${section.roleId}>.`)
        .setTimestamp();
      await logChannel.send({ embeds: [embed] }).catch(() => null);
    }
  }
}

// Handles a click on the optional "❌ I Don't Agree" button — either points
// the member at a support channel, or kicks them (DM'd first, best-effort).
export async function handleRulesGateDecline(interaction: ButtonInteraction, settingsId: string) {
  const settings = await prisma.rulesGateSettings.findUnique({ where: { id: settingsId } });
  if (!settings || !settings.declineEnabled) {
    await interaction.reply({ content: "⚠️ This option is no longer available.", ephemeral: true });
    return;
  }
  if (!interaction.guild) return;
  if (onCooldown(`decline:${settings.id}:${interaction.user.id}`)) {
    await interaction.reply({ content: "Hang on — still processing your last click.", ephemeral: true });
    return;
  }

  if (settings.declineAction === "CHANNEL") {
    const channelMention = settings.declineChannelId ? `<#${settings.declineChannelId}>` : "the support channel";
    await interaction.reply({
      content: renderMessage(settings.declineReplyMessage, DEFAULT_DECLINE_REPLY_CHANNEL, { server: interaction.guild.name, channel: channelMention }),
      ephemeral: true,
    });
    return;
  }

  if (settings.declineAction === "KICK") {
    await interaction.reply({
      content: renderMessage(settings.declineReplyMessage, DEFAULT_DECLINE_REPLY_KICK, { server: interaction.guild.name, channel: "" }),
      ephemeral: true,
    });
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (member?.kickable) {
      await member.kick("Declined server rules via Rules Gate").catch((err) => logError("bot", err, interaction.guildId ?? undefined));
    }
    return;
  }

  await interaction.reply({ content: "Okay — no changes were made.", ephemeral: true });
}

// Called from the dashboard's "New Rules Version" action (see
// apps/api/src/routes/rulesGateSettings.ts). Bumps rulesVersion and revokes
// roleId from everyone currently holding it, so they have to click Agree
// again — the historical RulesGateAgreement rows are left untouched.
export async function bumpRulesVersion(client: Client, guildId: string): Promise<{ newVersion: number; revoked: number }> {
  const settings = await prisma.rulesGateSettings.update({
    where: { guildId },
    data: { rulesVersion: { increment: 1 } },
  });

  let revoked = 0;
  if (settings.roleId) {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    const role = guild ? await guild.roles.fetch(settings.roleId).catch(() => null) : null;
    if (guild && role) {
      for (const member of role.members.values()) {
        await member.roles.remove(settings.roleId).catch(() => null);
        revoked++;
        await member.send(`📜 The rules in **${guild.name}** have been updated — please re-read and agree again to keep your access.`).catch(() => null);
      }
    }
  }

  return { newVersion: settings.rulesVersion, revoked };
}
