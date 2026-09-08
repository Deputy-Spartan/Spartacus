import cron from "node-cron";
import { Client, EmbedBuilder } from "discord.js";
import { prisma } from "../lib/prisma";
import { isSendableChannel } from "../lib/channels";

// Every minute, close out any giveaway whose end time has passed and hasn't
// been resolved yet. One tick covers every guild.
export function startGiveawayEnderJob(client: Client) {
  cron.schedule("* * * * *", async () => {
    const ended = await prisma.giveaway.findMany({
      where: { ended: false, endsAt: { lte: new Date() } },
      include: { entries: true },
      take: 50,
    });

    for (const giveaway of ended) {
      const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
      const entrants = giveaway.entries.map((e) => e.userId);
      const winners: string[] = [];
      const pool = [...entrants];

      for (let i = 0; i < giveaway.winnerCount && pool.length > 0; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        winners.push(pool.splice(idx, 1)[0]);
      }

      if (isSendableChannel(channel)) {
        const embed = new EmbedBuilder()
          .setColor(0xb14bff)
          .setTitle(`🎉 Giveaway Ended: ${giveaway.prize}`)
          .setDescription(
            winners.length > 0
              ? `Congratulations ${winners.map((w) => `<@${w}>`).join(", ")}!`
              : "No valid entries — no winner could be selected."
          );
        await channel.send({ embeds: [embed] }).catch(() => null);
      }

      await prisma.giveaway.update({ where: { id: giveaway.id }, data: { ended: true } });
    }
  });
}
