import cron from "node-cron";
import { Client } from "discord.js";
import { prisma } from "../lib/prisma";
import { isSendableChannel } from "../lib/channels";
import { renderPollEmbed, announcePollClosed } from "../modules/engagement/pollVotes";

// Every minute, closes any TIMER poll whose endsAt has passed — manual-stop
// polls are closed directly from the dashboard/API instead, never by this
// job. For CUSTOM polls, closing re-renders the embed (what actually
// reveals a private poll's real numbers for the first time). NATIVE polls
// finalize themselves on Discord's own side at their expiry — this just
// catches up our own "closed" bookkeeping and posts the same announcement
// reply either way.
export function startPollCloserJob(client: Client) {
  cron.schedule("* * * * *", async () => {
    const due = await prisma.poll.findMany({
      where: { closed: false, durationMode: "TIMER", endsAt: { lte: new Date() } },
      take: 50,
    });

    for (const poll of due) {
      const closed = await prisma.poll.update({ where: { id: poll.id }, data: { closed: true, closedAt: new Date() } });
      if (!closed.messageId) continue;

      const channel = await client.channels.fetch(poll.channelId).catch(() => null);
      if (!isSendableChannel(channel)) continue;

      const message = await channel.messages.fetch(closed.messageId).catch(() => null);
      if (!message) continue;

      if (closed.pollType === "CUSTOM") {
        const embed = await renderPollEmbed(closed);
        await message.edit({ embeds: [embed] }).catch(() => null);
      }
      await announcePollClosed(message);
    }
  });
}
