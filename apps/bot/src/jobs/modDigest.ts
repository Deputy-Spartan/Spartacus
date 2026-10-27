import cron from "node-cron";
import { EmbedBuilder, Client } from "discord.js";
import { prisma } from "../lib/prisma";
import { logError } from "@spartacus/db";
import { isSendableChannel } from "../lib/channels";
import { isModuleEnabled } from "../lib/moduleGate";
import type { ModDigestSettings } from "@prisma/client";

const ACTION_LABELS: Record<string, string> = {
  WARN: "warns",
  MUTE: "mutes",
  KICK: "kicks",
  BAN: "bans",
  UNBAN: "unbans",
  UNMUTE: "unmutes",
};

// How long after a scheduled (non-manual) send to ignore another match for
// the same settings row — guards against sending twice if the process
// restarts right on the matching minute. Comfortably shorter than either
// period so a legitimate next DAILY/WEEKLY run is never skipped.
const DEDUP_MS = { DAILY: 23 * 60 * 60 * 1000, WEEKLY: 6.5 * 24 * 60 * 60 * 1000 };

function isScheduledNow(settings: ModDigestSettings, now: Date): boolean {
  if (now.getUTCMinutes() !== 0 || now.getUTCHours() !== settings.hourUtc) return false;
  if (settings.frequency === "DAILY") return true;
  return now.getUTCDay() === settings.dayOfWeek;
}

function formatModeratorLine(moderatorId: string, counts: Record<string, number>): string {
  const parts = Object.entries(counts).map(([action, n]) => `${n} ${ACTION_LABELS[action] ?? action.toLowerCase()}`);
  return `<@${moderatorId}>: ${parts.join(", ")}`;
}

// Checks every minute for either a "Send Now" request or a matching
// scheduled slot, per guild — replaces the old single fixed Monday-12:00
// cron now that frequency/day/hour are configurable per server.
export function startModDigestJob(client: Client) {
  cron.schedule("* * * * *", async () => {
    let loggedThisTick = 0;
    const now = new Date();
    const settingsRows = await prisma.modDigestSettings.findMany({ where: { channelId: { not: null } } });
    if (settingsRows.length === 0) return;

    for (const settings of settingsRows) {
      const enabled = await isModuleEnabled(settings.guildId, "MOD_DIGEST");
      if (!enabled || !settings.channelId) continue;

      const manual = !!settings.manualSendRequestedAt;
      if (!manual) {
        if (!isScheduledNow(settings, now)) continue;
        const gapMs = DEDUP_MS[settings.frequency === "DAILY" ? "DAILY" : "WEEKLY"];
        if (settings.lastSentAt && now.getTime() - settings.lastSentAt.getTime() < gapMs) continue;
      }

      const sinceMs = settings.frequency === "DAILY" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
      const since = new Date(now.getTime() - sinceMs);

      const cases = await prisma.moderationCase.findMany({
        where: { guildId: settings.guildId, createdAt: { gte: since } },
        select: { moderatorId: true, action: true },
      });

      // Even with zero cases, a manual "Send Now" click should get visible
      // feedback instead of silently doing nothing — only the scheduled
      // path skips quiet periods.
      if (cases.length === 0 && !manual) {
        await prisma.modDigestSettings.update({ where: { id: settings.id }, data: { lastSentAt: now } });
        continue;
      }

      const byModerator = new Map<string, Record<string, number>>();
      for (const c of cases) {
        const counts = byModerator.get(c.moderatorId) ?? {};
        counts[c.action] = (counts[c.action] ?? 0) + 1;
        byModerator.set(c.moderatorId, counts);
      }

      const ranked = [...byModerator.entries()]
        .map(([moderatorId, counts]) => ({ moderatorId, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

      const lines: string[] = [];
      if (settings.staffRoleIds.length === 0) {
        for (const r of ranked) lines.push(formatModeratorLine(r.moderatorId, r.counts));
      } else {
        const guild = await client.guilds.fetch(settings.guildId).catch(() => null);
        for (const r of ranked) {
          const member = guild ? await guild.members.fetch(r.moderatorId).catch(() => null) : null;
          if (!member) continue;
          const heldRoleIds = settings.staffRoleIds.filter((id) => member.roles.cache.has(id));
          if (heldRoleIds.length === 0) continue;
          for (const roleId of heldRoleIds) {
            const role = guild?.roles.cache.get(roleId);
            lines.push(`${formatModeratorLine(r.moderatorId, r.counts)} — ${role ? `@${role.name}` : "staff"}`);
          }
        }
      }

      const channel = await client.channels.fetch(settings.channelId).catch(() => null);
      if (!isSendableChannel(channel)) continue;

      const periodLabel = settings.frequency === "DAILY" ? "Daily" : "Weekly";
      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle(`📋 ${periodLabel} Moderation Digest`)
        .setDescription(lines.length > 0 ? lines.join("\n") : "No moderation actions in this period.")
        .setFooter({ text: `Total actions this period: ${cases.length}` })
        .setTimestamp();

      await channel.send({ embeds: [embed] }).catch((err) => {
        if (loggedThisTick < 5) {
          logError("bot", err, settings.guildId);
          loggedThisTick++;
        }
        return null;
      });

      await prisma.modDigestSettings.update({ where: { id: settings.id }, data: { lastSentAt: now, manualSendRequestedAt: null } });
    }
  });
}
