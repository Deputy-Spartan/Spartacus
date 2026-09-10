import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { prisma } from "./prisma";
import { isModuleEnabled } from "./moduleGate";
import { isSendableChannel } from "./channels";
import type { CaseAction } from "@spartacus/db";
import type { Client } from "discord.js";
import { logError } from "@spartacus/db";

// Case numbers are per-guild sequential — computed from the current max
// rather than a separate counter table, which is fine at moderation-log
// volume and keeps the schema simpler.
export async function logCase(params: {
  guildId: string;
  userId: string;
  action: CaseAction;
  reason?: string | null;
  moderatorId: string;
  client?: Client;
}) {
  const last = await prisma.moderationCase.findFirst({
    where: { guildId: params.guildId },
    orderBy: { caseNumber: "desc" },
  });

  const created = await prisma.moderationCase.create({
    data: {
      guildId: params.guildId,
      caseNumber: (last?.caseNumber ?? 0) + 1,
      userId: params.userId,
      action: params.action,
      reason: params.reason,
      moderatorId: params.moderatorId,
    },
  });

  if (params.client) {
    await postAuditLog(params.client, params).catch(() => null);

    if (params.action === "WARN") {
      await checkWarnEscalation(params.client, params.guildId, params.userId).catch((err) => {
        logError("bot", err, params.guildId);
      });
    }

    if (params.action === "BAN" || params.action === "MUTE") {
      await sendAppealDm(params.client, params.guildId, params.userId, params.action, created.id).catch((err) => {
        logError("bot", err, params.guildId);
      });
    }
  }

  return created;
}

// ---- Warn Escalation ----
// Fires only once per rolling window — right when the WARN count hits the
// configured threshold, not on every warn after. The auto-escalation's own
// logCase() call below records a MUTE/KICK/BAN (never WARN), so it can't
// recursively re-trigger this check.
async function checkWarnEscalation(client: Client, guildId: string, userId: string) {
  const enabled = await isModuleEnabled(guildId, "WARN_ESCALATION");
  if (!enabled) return;

  const settings = await prisma.warnEscalationSettings.findUnique({ where: { guildId } });
  if (!settings) return;

  const windowStart = new Date(Date.now() - settings.warnWindowDays * 24 * 60 * 60 * 1000);
  const warnCount = await prisma.moderationCase.count({
    where: { guildId, userId, action: "WARN", createdAt: { gte: windowStart } },
  });

  if (warnCount !== settings.warnThreshold) return;

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  const member = await guild?.members.fetch(userId).catch(() => null);
  if (!member) return;

  const reason = `Auto-escalation: ${warnCount} warnings within ${settings.warnWindowDays} days`;
  const moderatorId = client.user?.id ?? "0";

  if (settings.action === "TIMEOUT") {
    await member.timeout(settings.timeoutMinutes * 60 * 1000, reason).catch(() => null);
    await logCase({ guildId, userId, action: "MUTE", reason, moderatorId, client });
  } else if (settings.action === "KICK") {
    await member.kick(reason).catch(() => null);
    await logCase({ guildId, userId, action: "KICK", reason, moderatorId, client });
  } else if (settings.action === "BAN") {
    await member.ban({ reason }).catch(() => null);
    await logCase({ guildId, userId, action: "BAN", reason, moderatorId, client });
  }
}

// ---- Ban/Mute Appeals ----
// Best-effort DM with an "Appeal" button whenever a member is banned or
// timed out, so long as the guild has BAN_APPEALS on and an appeal channel
// configured. Many users have DMs closed — that's expected, not an error.
async function sendAppealDm(client: Client, guildId: string, userId: string, action: "BAN" | "MUTE", caseId: string) {
  const enabled = await isModuleEnabled(guildId, "BAN_APPEALS");
  if (!enabled) return;

  const settings = await prisma.appealSettings.findUnique({ where: { guildId } });
  if (!settings?.appealChannelId) return;

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  const verb = action === "BAN" ? "banned from" : "muted in";
  const embed = new EmbedBuilder()
    .setColor(0xff4d6d)
    .setTitle("You've been " + (action === "BAN" ? "banned" : "muted"))
    .setDescription(`You were ${verb} **${guild?.name ?? "the server"}**. If you believe this was a mistake, you can submit an appeal below.`)
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`appeal:start:${caseId}`).setLabel("Appeal").setStyle(ButtonStyle.Primary)
  );

  const user = await client.users.fetch(userId).catch(() => null);
  await user?.send({ embeds: [embed], components: [row] }).catch(() => null);
}

// This is the one place every /ban /kick /mute /warn command already
// funnels through — hooking the "Moderation ban/unban" and "Member
// muted/unmuted" audit log entries here means those commands don't need
// to know anything about logging.
const ACTION_TO_TOGGLE: Partial<Record<CaseAction, "logModerationBan" | "logModerationUnban" | "logMemberMuted" | "logMemberUnmuted">> = {
  BAN: "logModerationBan",
  UNBAN: "logModerationUnban",
  MUTE: "logMemberMuted",
  UNMUTE: "logMemberUnmuted",
};

async function postAuditLog(client: Client, params: { guildId: string; userId: string; action: CaseAction; reason?: string | null; moderatorId: string }) {
  const toggleKey = ACTION_TO_TOGGLE[params.action];
  if (!toggleKey) return;

  const enabled = await isModuleEnabled(params.guildId, "MODERATION");
  if (!enabled) return;

  const config = await prisma.loggingConfig.findUnique({ where: { guildId: params.guildId } });
  if (!config?.logChannelId || !config[toggleKey]) return;

  const channel = await client.channels.fetch(config.logChannelId).catch(() => null);
  if (!isSendableChannel(channel)) return;

  const VERBS: Partial<Record<CaseAction, string>> = { BAN: "banned", UNBAN: "unbanned", MUTE: "muted", UNMUTE: "unmuted" };
  const verb = VERBS[params.action] ?? params.action.toLowerCase();
  const embed = new EmbedBuilder()
    .setColor(0x00e5ff)
    .setDescription(`🔨 <@${params.userId}> was ${verb} by <@${params.moderatorId}>${params.reason ? ` — ${params.reason}` : ""}`)
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => null);
}
