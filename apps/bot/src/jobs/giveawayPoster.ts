import cron from "node-cron";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder } from "discord.js";
import { prisma } from "../lib/prisma";
import { isSendableChannel } from "../lib/channels";

// Picks up giveaways created via the dashboard (messageId still null) and
// posts the live entry embed. Runs alongside giveawayEnder on its own tick.
export function startGiveawayPosterJob(client: Client) {
  cron.schedule("* * * * *", async () => {
    const pending = await prisma.giveaway.findMany({ where: { messageId: null, ended: false }, take: 20 });

    for (const giveaway of pending) {
      const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
      if (!isSendableChannel(channel)) continue;

      const embed = new EmbedBuilder()
        .setColor(0xb14bff)
        .setTitle(`🎁 ${giveaway.prize}`)
        .setDescription(`Click **Enter** below to join. Ends <t:${Math.floor(giveaway.endsAt.getTime() / 1000)}:R>.`)
        .setFooter({ text: `${giveaway.winnerCount} winner(s)` });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`giveaway:${giveaway.id}:enter`).setLabel("Enter").setStyle(ButtonStyle.Success)
      );

      const message = await channel.send({ embeds: [embed], components: [row] }).catch(() => null);
      if (message) await prisma.giveaway.update({ where: { id: giveaway.id }, data: { messageId: message.id } });
    }
  });
}
