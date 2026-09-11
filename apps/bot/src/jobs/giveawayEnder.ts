import cron from "node-cron";
import { Client, EmbedBuilder, type BaseMessageOptions } from "discord.js";
import { prisma } from "../lib/prisma";
import { logError } from "@spartacus/db";
import { isSendableChannel } from "../lib/channels";
import { applyEmbedExtra } from "../lib/embedExtra";
import { resolveSavedEmbed, buildSavedEmbedPayload } from "../lib/savedEmbedRender";

// Every minute, close out any giveaway whose end time has passed and hasn't
// been resolved yet. One tick covers every guild.
export function startGiveawayEnderJob(client: Client) {
  cron.schedule("* * * * *", async () => {
    let loggedThisTick = 0;
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
        const saved = await resolveSavedEmbed(giveaway.savedEmbedId);
        let payload: BaseMessageOptions;
        if (saved) {
          payload = await buildSavedEmbedPayload(giveaway.guildId, saved);
        } else {
          const embed = new EmbedBuilder()
            .setColor(0xb14bff)
            .setTitle(`🎉 Giveaway Ended: ${giveaway.prize}`)
            .setDescription(
              winners.length > 0 ? `Congratulations ${winners.map((w) => `<@${w}>`).join(", ")}!` : "No valid entries — no winner could be selected."
            );
          applyEmbedExtra(embed, giveaway.embedExtra);
          payload = { embeds: [embed] };
        }
        await channel.send(payload).catch((err) => {
          if (loggedThisTick < 5) { logError("bot", err, giveaway.guildId); loggedThisTick++; }
          return null;
        });
      }

      await prisma.giveaway.update({ where: { id: giveaway.id }, data: { ended: true } });
    }
  });
}
