import cron from "node-cron";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, StringSelectMenuBuilder } from "discord.js";
import { prisma } from "../lib/prisma";
import { isSendableChannel } from "../lib/channels";

// Posts (or reposts, after edits clear messageId) the button/dropdown panel
// for any ApplicationPanel that doesn't have a live message yet.
export function startApplicationPanelPosterJob(client: Client) {
  cron.schedule("* * * * *", async () => {
    const pending = await prisma.applicationPanel.findMany({ where: { messageId: null, paused: false }, take: 20 });

    for (const panel of pending) {
      const channel = await client.channels.fetch(panel.channelId).catch(() => null);
      if (!isSendableChannel(channel)) continue;

      const typeIds = Array.isArray(panel.typeIds) ? (panel.typeIds as string[]) : [];
      const types = typeIds.length
        ? await prisma.applicationType.findMany({ where: { id: { in: typeIds }, enabled: true } })
        : [];
      if (types.length === 0) continue;

      const embed = new EmbedBuilder()
        .setColor(0x4c8dff)
        .setTitle(panel.name)
        .setDescription(panel.description || "Click below to apply.");

      const component =
        panel.layout === "DROPDOWN"
          ? new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId(`applicationpanel:${panel.id}`)
                .setPlaceholder("Select an application type…")
                .addOptions(
                  types.map((t) => ({
                    label: t.name,
                    value: t.id,
                    emoji: t.emoji || undefined,
                    description: t.description?.slice(0, 100) || undefined,
                  }))
                )
            )
          : new ActionRowBuilder<ButtonBuilder>().addComponents(
              types.slice(0, 5).map((t) => {
                const button = new ButtonBuilder().setCustomId(`applicationpanel:${panel.id}:${t.id}`).setLabel(t.name).setStyle(ButtonStyle.Primary);
                if (t.emoji) button.setEmoji(t.emoji);
                return button;
              })
            );

      const message = await channel.send({ embeds: [embed], components: [component] }).catch(() => null);
      if (message) await prisma.applicationPanel.update({ where: { id: panel.id }, data: { messageId: message.id } });
    }
  });
}
