import cron from "node-cron";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder } from "discord.js";
import { prisma } from "../lib/prisma";
import { isSendableChannel } from "../lib/channels";

// Posts the button panel for any TicketPanel created via the dashboard that
// doesn't have a live message yet.
export function startTicketPanelPosterJob(client: Client) {
  cron.schedule("* * * * *", async () => {
    const pending = await prisma.ticketPanel.findMany({ where: { messageId: null }, take: 20 });

    for (const panel of pending) {
      const channel = await client.channels.fetch(panel.channelId).catch(() => null);
      if (!isSendableChannel(channel)) continue;

      const embed = new EmbedBuilder().setColor(0x00e5ff).setTitle(panel.name).setDescription("Click below to open a ticket.");
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`ticketpanel:${panel.id}`).setLabel(panel.buttonLabel).setStyle(ButtonStyle.Primary)
      );

      const message = await channel.send({ embeds: [embed], components: [row] }).catch(() => null);
      if (message) await prisma.ticketPanel.update({ where: { id: panel.id }, data: { messageId: message.id } });
    }
  });
}
