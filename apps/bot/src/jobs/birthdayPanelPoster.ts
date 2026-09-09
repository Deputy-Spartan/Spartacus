import cron from "node-cron";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder } from "discord.js";
import { prisma } from "../lib/prisma";
import { isSendableChannel } from "../lib/channels";

// Posts (or reposts, after a channel change clears buttonMessageId) the
// "Set My Birthday" button panel for any guild that has turned it on.
export function startBirthdayPanelPosterJob(client: Client) {
  cron.schedule("* * * * *", async () => {
    const pending = await prisma.birthdayConfig.findMany({
      where: { useButton: true, buttonMessageId: null, buttonChannelId: { not: null } },
      take: 20,
    });

    for (const config of pending) {
      const channel = await client.channels.fetch(config.buttonChannelId as string).catch(() => null);
      if (!isSendableChannel(channel)) continue;

      const embed = new EmbedBuilder()
        .setColor((config.embedColor as `#${string}`) || "#FF69B4")
        .setTitle("🎂 Set Your Birthday")
        .setDescription("Click below to save your birthday — we'll celebrate it with you on the day!");

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("birthdaypanel").setLabel("Set My Birthday").setEmoji("🎂").setStyle(ButtonStyle.Primary)
      );

      const message = await channel.send({ embeds: [embed], components: [row] }).catch(() => null);
      if (message) await prisma.birthdayConfig.update({ where: { id: config.id }, data: { buttonMessageId: message.id } });
    }
  });
}
