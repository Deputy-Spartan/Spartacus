import cron from "node-cron";
import { Client } from "discord.js";
import { prisma } from "../lib/prisma";
import { logError } from "@spartacus/db";
import { isModuleEnabled } from "../lib/moduleGate";
import { showBumpStage } from "../lib/bumpStatus";
import { COOLDOWN_MS } from "../modules/community/bumpReminder";

// Missed alerts come every 2 hours for the first day, then every 6 hours, so
// a quiet day never means silence, but an empty server isn't spammed either.
const FAST_ALERTS = 12;
const SLOW_MS = 6 * 60 * 60 * 1000;
const alertOffset = (n: number) => (n <= FAST_ALERTS ? n * COOLDOWN_MS : FAST_ALERTS * COOLDOWN_MS + (n - FAST_ALERTS) * SLOW_MS);

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

    // 0. Set up but no bump seen yet: treat it as ready now, so it starts on
    // its own instead of waiting forever for a first bump.
    const fresh = await prisma.bumpReminderSettings.findMany({ where: { nextReminderAt: null, channelId: { not: null } }, select: { id: true, guildId: true }, take: 100 });
    for (const row of fresh) {
      if (await isModuleEnabled(row.guildId, "BUMP_REMINDER")) await prisma.bumpReminderSettings.updateMany({ where: { id: row.id, nextReminderAt: null }, data: { nextReminderAt: new Date(), reminded: false } });
    }

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

    // 2. Nobody bumped in time: alert every 2 hours for a day, then every 6.
    const watching = await prisma.bumpReminderSettings.findMany({
      where: { missedAlertEnabled: true, reminded: true, nextReminderAt: { not: null }, channelId: { not: null } },
      take: 500,
    });
    const now = Date.now();
    for (const row of watching) {
      const alertAt = (n: number) => row.nextReminderAt!.getTime() + row.missedAfterMin * 60_000 + alertOffset(n);
      if (now < alertAt(row.missedAlerts)) continue;
      // One alert now. If it was quiet for a long time (a restart, or an old
      // setup), skip ahead to the next alert that's still to come, instead of
      // sending every missed one in a row.
      let next = row.missedAlerts + 1;
      while (alertAt(next) <= now) next++;
      // Claim this alert first so a slow send can't post it twice.
      const claimed = await prisma.bumpReminderSettings.updateMany({ where: { id: row.id, missedAlerts: row.missedAlerts }, data: { missedAlerts: next } });
      if (!claimed.count || !(await isModuleEnabled(row.guildId, "BUMP_REMINDER"))) continue;
      await show(row.guildId, "missed");
    }
  });
}
