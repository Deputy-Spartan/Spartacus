import cron from "node-cron";
import { Client } from "discord.js";
import { prisma } from "../lib/prisma";
import { logError } from "@spartacus/db";
import { isModuleEnabled } from "../lib/moduleGate";
import { isSendableChannel } from "../lib/channels";

// Checked on a cron tick rather than a setTimeout per guild specifically
// so a pending reminder survives a bot restart — apps/bot/src/modules/community/bumpReminder.ts
// is what actually sets nextReminderAt/reminded when a bump is detected.
export function startBumpReminderJob(client: Client) {
  cron.schedule("* * * * *", async () => {
    let loggedThisTick = 0;
    const due = await prisma.bumpReminderSettings.findMany({
      where: { reminded: false, nextReminderAt: { lte: new Date() }, channelId: { not: null } },
      take: 200,
    });

    for (const row of due) {
      const enabled = await isModuleEnabled(row.guildId, "BUMP_REMINDER");
      if (!enabled) {
        await prisma.bumpReminderSettings.update({ where: { id: row.id }, data: { reminded: true } });
        continue;
      }

      const channel = await client.channels.fetch(row.channelId as string).catch(() => null);
      if (isSendableChannel(channel)) {
        const mention = row.mentionRoleId ? `<@&${row.mentionRoleId}> ` : "";
        await channel
          .send(`${mention}⏰ It's been 2 hours — the server can be **/bump**ed again on Disboard!`)
          .catch((err) => {
            if (loggedThisTick < 5) {
              logError("bot", err, row.guildId);
              loggedThisTick++;
            }
          });
      }

      await prisma.bumpReminderSettings.update({ where: { id: row.id }, data: { reminded: true } });
    }
  });
}
