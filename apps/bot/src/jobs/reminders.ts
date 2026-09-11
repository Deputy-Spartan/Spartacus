import cron from "node-cron";
import { Client } from "discord.js";
import { prisma } from "../lib/prisma";
import { logError } from "@spartacus/db";

// Runs every minute. The module gate already happened at creation time in
// /remindme, so this just processes whatever due rows exist.
export function startRemindersJob(client: Client) {
  cron.schedule("* * * * *", async () => {
    const due = await prisma.reminder.findMany({
      where: { remindAt: { lte: new Date() } },
    });

    for (const reminder of due) {
      const content = `⏰ Reminder: ${reminder.message}`;

      const dmSent = await client.users
        .send(reminder.userId, content)
        .then(() => true)
        .catch(() => false);

      if (!dmSent) {
        const channel = await client.channels.fetch(reminder.channelId).catch(() => null);
        if (channel && channel.isTextBased() && !channel.isDMBased() && "send" in channel) {
          await channel.send(`<@${reminder.userId}> ${content}`).catch(() => null);
        }
      }

      await prisma.reminder.delete({ where: { id: reminder.id } }).catch((err) => {
        logError("bot", err, reminder.guildId ?? undefined);
      });
    }
  });
}
