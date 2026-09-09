import cron from "node-cron";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, StringSelectMenuBuilder } from "discord.js";
import { prisma } from "../lib/prisma";
import { isSendableChannel } from "../lib/channels";

// Posts the button/dropdown panel for any TicketPanel created or edited via
// the dashboard that doesn't have a live message yet (editing clears
// messageId so this redraws it).
export function startTicketPanelPosterJob(client: Client) {
  cron.schedule("* * * * *", async () => {
    const pending = await prisma.ticketPanel.findMany({ where: { messageId: null, paused: false }, take: 20 });

    for (const panel of pending) {
      const channel = await client.channels.fetch(panel.channelId).catch(() => null);
      if (!isSendableChannel(channel)) continue;

      const typeIds = Array.isArray(panel.typeIds) ? (panel.typeIds as string[]) : [];
      const types = typeIds.length
        ? await prisma.ticketType.findMany({ where: { id: { in: typeIds }, enabled: true } })
        : [];

      const embed = new EmbedBuilder()
        .setColor(0x3b82f6)
        .setTitle(panel.name)
        .setDescription(panel.description || "Click below to open a ticket.");

      let component: ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>;

      if (types.length === 0) {
        component = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`ticketpanel:${panel.id}`).setLabel(panel.buttonLabel).setStyle(ButtonStyle.Primary)
        );
      } else if (panel.layout === "DROPDOWN") {
        component = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`ticketpanel:${panel.id}`)
            .setPlaceholder("Select a ticket type…")
            .addOptions(
              types.map((t) => ({
                label: t.name,
                value: t.id,
                emoji: t.emoji || undefined,
                description: t.description?.slice(0, 100) || undefined,
              }))
            )
        );
      } else {
        component = new ActionRowBuilder<ButtonBuilder>().addComponents(
          types.slice(0, 5).map((t) => {
            const button = new ButtonBuilder().setCustomId(`ticketpanel:${panel.id}:${t.id}`).setLabel(t.name).setStyle(ButtonStyle.Primary);
            if (t.emoji) button.setEmoji(t.emoji);
            return button;
          })
        );
      }

      const message = await channel.send({ embeds: [embed], components: [component] }).catch(() => null);
      if (message) await prisma.ticketPanel.update({ where: { id: panel.id }, data: { messageId: message.id } });
    }
  });
}
