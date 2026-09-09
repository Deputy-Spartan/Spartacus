import cron from "node-cron";
import { Client } from "discord.js";
import { prisma } from "../lib/prisma";
import { buildEventPayload } from "../lib/eventRender";
import { isSendableChannel } from "../lib/channels";

// Dashboard-created/edited events only write to the database — this is
// what actually turns that into a real Discord message. Runs every 15s so
// dashboard changes show up almost immediately without needing the bot
// and API to share a process or talk to each other directly.
export function startEventSyncJob(client: Client) {
  cron.schedule("*/15 * * * * *", async () => {
    const pending = await prisma.event.findMany({ where: { needsSync: true }, take: 50 });

    for (const event of pending) {
      const channel = await client.channels.fetch(event.channelId).catch(() => null);
      if (!isSendableChannel(channel)) {
        await prisma.event.update({ where: { id: event.id }, data: { needsSync: false } }).catch(() => null);
        continue;
      }

      const payload = buildEventPayload(event);

      if (event.messageId) {
        const existing = await channel.messages.fetch(event.messageId).catch(() => null);
        if (existing) {
          await existing.edit(payload).catch(() => null);
          await prisma.event.update({ where: { id: event.id }, data: { needsSync: false } }).catch(() => null);
          continue;
        }
      }

      const posted = await channel.send(payload).catch(() => null);
      if (posted) {
        await prisma.event.update({ where: { id: event.id }, data: { messageId: posted.id, needsSync: false } }).catch(() => null);
      }
    }
  });
}
