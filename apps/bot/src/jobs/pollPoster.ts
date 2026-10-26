import cron from "node-cron";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client } from "discord.js";
import { prisma } from "../lib/prisma";
import { logError } from "@spartacus/db";
import { isSendableChannel } from "../lib/channels";
import { isModuleEnabled } from "../lib/moduleGate";
import { renderPollEmbed } from "../modules/engagement/pollVotes";

// Picks up polls created via the dashboard (messageId still null), posts
// the embed, and reacts with every configured emoji so members have
// something to click immediately — the actual vote tracking lives in
// modules/engagement/pollVotes.ts, matched purely by messageId.
export function startPollPosterJob(client: Client) {
  cron.schedule("*/5 * * * * *", async () => {
    let loggedThisTick = 0;
    const pending = await prisma.poll.findMany({ where: { messageId: null, closed: false }, take: 20 });

    for (const poll of pending) {
      if (!(await isModuleEnabled(poll.guildId, "POLLS"))) continue;
      if (poll.options.length === 0 || poll.emojis.length !== poll.options.length) continue;

      const channel = await client.channels.fetch(poll.channelId).catch(() => null);
      if (!isSendableChannel(channel)) continue;

      const embed = await renderPollEmbed(poll);
      const components = poll.allowWriteIn
        ? [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`poll:writein:${poll.id}`).setLabel("✍️ Write In").setStyle(ButtonStyle.Secondary))]
        : [];
      const message = await channel.send({ embeds: [embed], components }).catch((err) => {
        if (loggedThisTick < 5) { logError("bot", err, poll.guildId); loggedThisTick++; }
        return null;
      });
      if (!message) continue;

      for (const emoji of poll.emojis) {
        await message.react(emoji).catch(() => null);
      }

      await prisma.poll.update({ where: { id: poll.id }, data: { messageId: message.id } });
    }
  });
}
