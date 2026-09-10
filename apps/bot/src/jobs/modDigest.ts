import cron from "node-cron";
import { EmbedBuilder, Client } from "discord.js";
import { prisma } from "../lib/prisma";
import { logError } from "@spartacus/db";
import { isSendableChannel } from "../lib/channels";
import { isModuleEnabled } from "../lib/moduleGate";

const ACTION_LABELS: Record<string, string> = {
  WARN: "warns",
  MUTE: "mutes",
  KICK: "kicks",
  BAN: "bans",
  UNBAN: "unbans",
  UNMUTE: "unmutes",
};

// Runs Monday 12:00 UTC — summarizes the past 7 days of moderation activity
// per guild that has this module enabled and a channel configured.
// Guilds with zero cases in the window are skipped entirely (no "quiet
// week" spam) rather than posting an empty digest.
export function startModDigestJob(client: Client) {
  cron.schedule("0 12 * * MON", async () => {
    let loggedThisTick = 0;
    const settingsRows = await prisma.modDigestSettings.findMany({ where: { channelId: { not: null } } });
    if (settingsRows.length === 0) return;

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    for (const settings of settingsRows) {
      const enabled = await isModuleEnabled(settings.guildId, "MOD_DIGEST");
      if (!enabled || !settings.channelId) continue;

      const cases = await prisma.moderationCase.findMany({
        where: { guildId: settings.guildId, createdAt: { gte: since } },
        select: { moderatorId: true, action: true },
      });
      if (cases.length === 0) continue;

      const byModerator = new Map<string, Record<string, number>>();
      for (const c of cases) {
        const counts = byModerator.get(c.moderatorId) ?? {};
        counts[c.action] = (counts[c.action] ?? 0) + 1;
        byModerator.set(c.moderatorId, counts);
      }

      const lines: string[] = [];
      for (const [moderatorId, counts] of byModerator) {
        const parts = Object.entries(counts).map(([action, n]) => `${n} ${ACTION_LABELS[action] ?? action.toLowerCase()}`);
        lines.push(`<@${moderatorId}>: ${parts.join(", ")}`);
      }

      const channel = await client.channels.fetch(settings.channelId).catch(() => null);
      if (!isSendableChannel(channel)) continue;

      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle("📋 Weekly Moderation Digest")
        .setDescription(lines.join("\n"))
        .setFooter({ text: `Total actions this week: ${cases.length}` })
        .setTimestamp();

      await channel.send({ embeds: [embed] }).catch((err) => {
        if (loggedThisTick < 5) { logError("bot", err, settings.guildId); loggedThisTick++; }
        return null;
      });
    }
  });
}
