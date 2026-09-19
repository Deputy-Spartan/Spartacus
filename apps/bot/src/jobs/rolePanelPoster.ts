import cron from "node-cron";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, StringSelectMenuBuilder } from "discord.js";
import { prisma } from "../lib/prisma";
import { logError } from "@spartacus/db";
import { isSendableChannel } from "../lib/channels";
import { isModuleEnabled } from "../lib/moduleGate";
import { applyEmbedExtra } from "../lib/embedExtra";
import { normalizeOption } from "../lib/accessGrants";
import { resolveSavedEmbed, buildSavedEmbedPayload } from "../lib/savedEmbedRender";

// Posts the button/dropdown panel for any RolePanel created or edited via
// the dashboard that doesn't have a live message yet (editing clears
// messageId so this redraws it).
export function startRolePanelPosterJob(client: Client) {
  cron.schedule("*/5 * * * * *", async () => {
    let loggedThisTick = 0;
    const pending = await prisma.rolePanel.findMany({ where: { messageId: null }, take: 20 });

    for (const panel of pending) {
      if (!(await isModuleEnabled(panel.guildId, "REACTION_ROLES"))) continue;

      const channel = await client.channels.fetch(panel.channelId).catch(() => null);
      if (!isSendableChannel(channel)) continue;

      const options = (Array.isArray(panel.options) ? panel.options : []).map(normalizeOption);
      if (options.length === 0) continue;

      // A saved embed only supplies the embed body — the role buttons/dropdown
      // below are always required.
      const savedEmbed = await resolveSavedEmbed(panel.savedEmbedId);
      const embeds = savedEmbed
        ? (await buildSavedEmbedPayload(panel.guildId, savedEmbed)).embeds
        : [
            applyEmbedExtra(
        new EmbedBuilder()
          .setColor((panel.embedEnabled && panel.embedColor ? (panel.embedColor as `#${string}`) : "#3b82f6"))
          .setTitle(panel.name)
          .setDescription(panel.description || "Click below to pick your roles."),
        panel.embedEnabled ? panel.embedExtra : null
            ),
          ];

      const component =
        panel.layout === "DROPDOWN"
          ? new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId(`rolepanelselect:${panel.id}`)
                .setPlaceholder("Select your roles…")
                .setMinValues(0)
                .setMaxValues(options.length)
                .addOptions(
                  options.slice(0, 25).map((o, i) => ({
                    label: o.label || "Option",
                    value: `o${i}`,
                    emoji: o.emoji || undefined,
                  }))
                )
            )
          : undefined;
      // Up to 5 rows of 5 buttons; a button can be just an emoji.
      const buttons = options.slice(0, 25).map((o, i) => {
        const button = new ButtonBuilder().setCustomId(`rolepanel:${panel.id}:o${i}`).setStyle(ButtonStyle.Secondary);
        if (o.label) button.setLabel(o.label);
        if (o.emoji) button.setEmoji(o.emoji);
        if (!o.label && !o.emoji) button.setLabel("Option");
        return button;
      });
      const rows =
        panel.layout === "DROPDOWN"
          ? [component!]
          : Array.from({ length: Math.ceil(buttons.length / 5) }, (_, r) => new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(r * 5, r * 5 + 5)));

      const message = await channel.send({ embeds, components: rows }).catch((err) => {
        if (loggedThisTick < 5) { logError("bot", err, panel.guildId); loggedThisTick++; }
        return null;
      });
      if (message) await prisma.rolePanel.update({ where: { id: panel.id }, data: { messageId: message.id } });
    }
  });
}
