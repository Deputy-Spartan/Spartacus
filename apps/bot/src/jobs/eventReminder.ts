import cron from "node-cron";
import { Client } from "discord.js";
import { prisma } from "../lib/prisma";
import { isSendableChannel } from "../lib/channels";

// Runs every minute and checks for events starting within their configured
// reminder window (15-30 min out) that haven't been reminded yet. One tick
// covers every guild — no per-guild timers.
export function startEventReminderJob(client: Client) {
  cron.schedule("* * * * *", async () => {
    const now = new Date();

    const upcoming = await prisma.event.findMany({
      where: { status: "SCHEDULED" },
      include: { signups: { where: { reminded: false } } },
      take: 100, // bounded batch per tick
    });

    for (const event of upcoming) {
      const msUntilStart = event.startTime.getTime() - now.getTime();
      const reminderWindowMs = event.reminderMinutesBefore * 60 * 1000;

      if (msUntilStart > reminderWindowMs || msUntilStart < 0) continue;

      const channel = await client.channels.fetch(event.channelId).catch(() => null);
      const attendees = event.signups.filter((s) => s.role !== "ABSENT");
      const settings = await prisma.eventSettings.findUnique({ where: { guildId: event.guildId } });
      const roleMention = settings?.mentionRoleId ? `<@&${settings.mentionRoleId}> ` : "";

      if (isSendableChannel(channel) && (attendees.length > 0 || roleMention)) {
        const mentions = attendees.map((s) => `<@${s.userId}>`).join(" ");
        await channel
          .send(`⏰ ${roleMention}**${event.title}** starts <t:${Math.floor(event.startTime.getTime() / 1000)}:R> — ${mentions}`)
          .catch(() => null);
      }

      await prisma.eventSignup.updateMany({
        where: { eventId: event.id },
        data: { reminded: true },
      });
      await prisma.event.update({ where: { id: event.id }, data: { status: "REMINDED" } });
    }

    // Mark long-past events completed so they drop out of future ticks' scan set.
    await prisma.event.updateMany({
      where: { status: { in: ["SCHEDULED", "REMINDED"] }, startTime: { lt: new Date(now.getTime() - 60 * 60 * 1000) } },
      data: { status: "COMPLETED" },
    });
  });
}
