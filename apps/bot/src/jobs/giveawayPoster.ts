import cron from "node-cron";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, type BaseMessageOptions } from "discord.js";
import { prisma } from "../lib/prisma";
import { logError } from "@spartacus/db";
import { isSendableChannel } from "../lib/channels";
import { applyEmbedExtra } from "../lib/embedExtra";
import { resolveSavedEmbed, buildSavedEmbedPayload } from "../lib/savedEmbedRender";

interface GiveawayButton {
  label: string;
  url: string;
}

// Picks up giveaways created via the dashboard (messageId still null) and
// posts the live entry embed. Runs alongside giveawayEnder on its own tick.
export function startGiveawayPosterJob(client: Client) {
  cron.schedule("* * * * *", async () => {
    let loggedThisTick = 0;
    const pending = await prisma.giveaway.findMany({ where: { messageId: null, ended: false }, take: 20 });

    for (const giveaway of pending) {
      const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
      if (!isSendableChannel(channel)) continue;

      const saved = await resolveSavedEmbed(giveaway.savedEmbedId);
      let payload: BaseMessageOptions;

      if (saved) {
        payload = await buildSavedEmbedPayload(giveaway.guildId, saved);
      } else {
        const embed = new EmbedBuilder()
          .setColor((giveaway.embedColor as `#${string}`) || "#B14BFF")
          .setTitle(`🎁 ${giveaway.prize}`)
          .setDescription(
            `${giveaway.description ? `${giveaway.description}\n\n` : ""}Click **Enter** below to join. Ends <t:${Math.floor(giveaway.endsAt.getTime() / 1000)}:R>.`
          )
          .setFooter({ text: `${giveaway.winnerCount} winner(s)` });
        if (giveaway.imageUrl) embed.setImage(giveaway.imageUrl);
        applyEmbedExtra(embed, giveaway.embedExtra);

        const linkButtons = Array.isArray(giveaway.buttons) ? (giveaway.buttons as unknown as GiveawayButton[]) : [];
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`giveaway:${giveaway.id}:enter`).setLabel("Enter").setStyle(ButtonStyle.Success),
          ...linkButtons.map((b) => new ButtonBuilder().setLabel(b.label).setURL(b.url).setStyle(ButtonStyle.Link))
        );
        payload = { embeds: [embed], components: [row] };
      }

      const message = await channel.send(payload).catch((err) => {
        if (loggedThisTick < 5) { logError("bot", err, giveaway.guildId); loggedThisTick++; }
        return null;
      });
      if (message) await prisma.giveaway.update({ where: { id: giveaway.id }, data: { messageId: message.id } });
    }
  });
}
