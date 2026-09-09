import { EmbedBuilder } from "discord.js";
import { prisma } from "./prisma";
import { isModuleEnabled } from "./moduleGate";
import { isSendableChannel } from "./channels";
import type { CaseAction } from "@spartacus/db";
import type { Client } from "discord.js";

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
  }

  return created;
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
