import cron from "node-cron";
import { Client } from "discord.js";
import { prisma } from "../lib/prisma";
import { logError } from "@spartacus/db";
import { isModuleEnabled } from "../lib/moduleGate";
import { showBumpStage } from "../lib/bumpStatus";
import { COOLDOWN_MS } from "../modules/community/bumpReminder";

// Stop alerting after a day of missed bumps, so an abandoned server isn't spammed.
const MAX_MISSED_ALERTS = 12;

// Checked on a cron tick rather than a setTimeout per guild specifically
// so a pending reminder survives a bot restart — apps/bot/src/modules/community/bumpReminder.ts
// is what actually sets nextReminderAt/reminded when a bump is detected.
// Each stage replaces the one Spartacus bump message (see lib/bumpStatus.ts).
export function startBumpReminderJob(client: Client) {
  cron.schedule("* * * * *", async () => {
    let logged = 0;
    const show = (guildId: string, stage: "ready" | "missed") =>
      showBumpStage(client, guildId, stage, { ping: true }).catch((err) => {
        if (logged++ < 5) logError("bot", err, guildId);
      });

    // 1. The 2 hours are up: the server can be bumped.
    const due = await prisma.bumpReminderSettings.findMany({
      where: { reminded: false, nextReminderAt: { lte: new Date() }, channelId: { not: null } },
      take: 200,
    });
    for (const row of due) {
      await prisma.bumpReminderSettings.update({ where: { id: row.id }, data: { reminded: true } });
      if (!(await isModuleEnabled(row.guildId, "BUMP_REMINDER"))) continue;
      await show(row.guildId, "ready");
    }

    // 2. Nobody bumped in time: alert once per missed 2-hour window.
    const watching = await prisma.bumpReminderSettings.findMany({
      where: { missedAlertEnabled: true, reminded: true, nextReminderAt: { not: null }, channelId: { not: null }, missedAlerts: { lt: MAX_MISSED_ALERTS } },
      take: 500,
    });
    const now = Date.now();
    for (const row of watching) {
      const alertAt = row.nextReminderAt!.getTime() + row.missedAfterMin * 60_000 + row.missedAlerts * COOLDOWN_MS;
      if (now < alertAt) continue;
      // Claim this alert first so a slow send can't post it twice.
      const claimed = await prisma.bumpReminderSettings.updateMany({ where: { id: row.id, missedAlerts: row.missedAlerts }, data: { missedAlerts: row.missedAlerts + 1 } });
      if (!claimed.count || !(await isModuleEnabled(row.guildId, "BUMP_REMINDER"))) continue;
      await show(row.guildId, "missed");
    }
  });
}
