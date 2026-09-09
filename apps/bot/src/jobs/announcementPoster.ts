import cron from "node-cron";
import { Client } from "discord.js";
import { prisma } from "../lib/prisma";
import { isSendableChannel } from "../lib/channels";
import { isModuleEnabled } from "../lib/moduleGate";
import { buildStickyPayload } from "../lib/stickyRender";

// Checks every minute for announcements that are due — either scheduled for
// a time that has now passed, or created with no schedule at all (send
// immediately, within the next minute).
export function startAnnouncementPosterJob(client: Client) {
  cron.schedule("* * * * *", async () => {
    const due = await prisma.announcement.findMany({
      where: { sentAt: null, OR: [{ scheduledFor: null }, { scheduledFor: { lte: new Date() } }] },
      take: 20,
    });

    for (const announcement of due) {
      const enabled = await isModuleEnabled(announcement.guildId, "ANNOUNCEMENTS");
      if (!enabled) continue;

      const channel = await client.channels.fetch(announcement.channelId).catch(() => null);
      if (!isSendableChannel(channel)) {
        await prisma.announcement.update({ where: { id: announcement.id }, data: { sentAt: new Date() } });
        continue;
      }

      const payload = buildStickyPayload({
        content: announcement.content ?? "",
        embedEnabled: announcement.embedEnabled,
        embedTitle: announcement.embedTitle,
        embedDescription: announcement.content,
        embedColor: announcement.embedColor,
        buttons: announcement.buttons,
      });

      await channel.send(payload).catch(() => null);
      await prisma.announcement.update({ where: { id: announcement.id }, data: { sentAt: new Date() } });
    }
  });
}
