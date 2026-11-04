import cron from "node-cron";
import { Client } from "discord.js";
import { prisma } from "../lib/prisma";
import { logError } from "@spartacus/db";
import { isModuleEnabled } from "../lib/moduleGate";
import { isSendableChannel } from "../lib/channels";
import { COOLDOWN_MS } from "../modules/community/bumpReminder";

// Disboard's /bump, shown as a clickable command in the message.
export const BUMP_COMMAND = "</bump:947088344167366698>";
// Stop alerting after a day of missed bumps, so an abandoned server isn't spammed.
const MAX_MISSED_ALERTS = 12;

// Checked on a cron tick rather than a setTimeout per guild specifically
// so a pending reminder survives a bot restart — apps/bot/src/modules/community/bumpReminder.ts
// is what actually sets nextReminderAt/reminded when a bump is detected.
export function startBumpReminderJob(client: Client) {
  cron.schedule("* * * * *", async () => {
    let loggedThisTick = 0;
    const send = async (row: { guildId: string; channelId: string | null; mentionRoleId: string | null }, text: string) => {
      const channel = await client.channels.fetch(row.channelId as string).catch(() => null);
      if (!isSendableChannel(channel)) return;
      const mention = row.mentionRoleId ? `<@&${row.mentionRoleId}> ` : "";
      await channel.send({ content: `${mention}${text}`, allowedMentions: { roles: row.mentionRoleId ? [row.mentionRoleId] : [] } }).catch((err) => {
        if (loggedThisTick < 5) {
          logError("bot", err, row.guildId);
          loggedThisTick++;
        }
      });
    };

    // 1. The 2 hours are up: say the server can be bumped.
    const due = await prisma.bumpReminderSettings.findMany({
      where: { reminded: false, nextReminderAt: { lte: new Date() }, channelId: { not: null } },
      take: 200,
    });
    for (const row of due) {
      await prisma.bumpReminderSettings.update({ where: { id: row.id }, data: { reminded: true } });
      if (!(await isModuleEnabled(row.guildId, "BUMP_REMINDER"))) continue;
      await send(row, `⏰ The server can be bumped again! Use ${BUMP_COMMAND} on Disboard.`);
    }

    // 2. Nobody bumped in time: alert once per missed 2-hour window.
    const watching = await prisma.bumpReminderSettings.findMany({
      where: { missedAlertEnabled: true, reminded: true, nextReminderAt: { not: null }, channelId: { not: null }, missedAlerts: { lt: MAX_MISSED_ALERTS } },
      take: 500,
    });
    const now = Date.now();
    for (const row of watching) {
      const ready = row.nextReminderAt!.getTime();
      const alertAt = ready + row.missedAfterMin * 60_000 + row.missedAlerts * COOLDOWN_MS;
      if (now < alertAt) continue;
      // Claim this alert first so a slow send can't post it twice.
      const claimed = await prisma.bumpReminderSettings.updateMany({ where: { id: row.id, missedAlerts: row.missedAlerts }, data: { missedAlerts: row.missedAlerts + 1 } });
      if (!claimed.count || !(await isModuleEnabled(row.guildId, "BUMP_REMINDER"))) continue;
      const readyTs = Math.floor(ready / 1000);
      const missed = row.missedAlerts + 1;
      await send(
        row,
        `⚠️ **Bump missed!** The server could be bumped <t:${readyTs}:R> and nobody has yet${missed > 1 ? ` (${missed} bumps missed in a row)` : ""}. Use ${BUMP_COMMAND} now.`,
      );
    }
  });
}
