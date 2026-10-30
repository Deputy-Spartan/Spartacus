import cron from "node-cron";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, StringSelectMenuBuilder } from "discord.js";
import type { RolePanel } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logError } from "@spartacus/db";
import { isSendableChannel } from "../lib/channels";
import { isModuleEnabled } from "../lib/moduleGate";
import { applyEmbedExtra } from "../lib/embedExtra";
import { describeAccess, normalizeOption } from "../lib/accessGrants";
import { resolveSavedEmbed, buildSavedEmbedPayload } from "../lib/savedEmbedRender";

async function buildPayload(client: Client, panel: RolePanel) {
  const options = (Array.isArray(panel.options) ? panel.options : []).map(normalizeOption);
  if (options.length === 0) return null;

  // Same "emoji — @Role" key the reaction panels post, so an emoji-only
  // button still says what it gives.
  const listing = options
    .slice(0, 25)
    .map((o) => `${[o.emoji, o.label && `**${o.label}**`].filter(Boolean).join(" ") || "•"} — ${describeAccess(o) || "(nothing)"}`)
    .join("\n");
  const description = [panel.description || "Click below to pick your roles.", "", listing].join("\n").slice(0, 4096);

  // A saved embed only supplies the embed body — the role buttons/dropdown
  // below are always required.
  const savedEmbed = await resolveSavedEmbed(panel.savedEmbedId);
  const embeds = savedEmbed
    ? (await buildSavedEmbedPayload(panel.guildId, savedEmbed)).embeds ?? []
    : [
        applyEmbedExtra(
          new EmbedBuilder()
            .setColor(panel.embedEnabled && panel.embedColor ? (panel.embedColor as `#${string}`) : "#3b82f6")
            .setTitle(panel.name)
            .setDescription(description),
          panel.embedEnabled ? panel.embedExtra : null
        ),
      ];

  if (panel.layout === "DROPDOWN") {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`rolepanelselect:${panel.id}`)
      .setPlaceholder("Select your roles…")
      .setMinValues(0)
      .setMaxValues(Math.min(options.length, 25))
      .addOptions(options.slice(0, 25).map((o, i) => ({ label: o.label || "Option", value: `o${i}`, emoji: o.emoji || undefined })));
    return { embeds, components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)] };
  }

  // Up to 5 rows of 5 buttons. A button with no label of its own is named
  // after the first role (or channel) it gives, so it reads "🏀 Sports Gamer"
  // instead of a bare emoji — minus any emoji the name itself starts with,
  // which would otherwise show twice next to the button's emoji.
  const guild = client.guilds.cache.get(panel.guildId);
  const fallbackLabel = (o: (typeof options)[number]) => {
    const name =
      (o.roleIds[0] && guild?.roles.cache.get(o.roleIds[0])?.name) || (o.channelIds[0] && guild?.channels.cache.get(o.channelIds[0])?.name) || "";
    return name.replace(/^[^\p{L}\p{N}]+/u, "").trim().slice(0, 80);
  };
  const buttons = options.slice(0, 25).map((o, i) => {
    const button = new ButtonBuilder().setCustomId(`rolepanel:${panel.id}:o${i}`).setStyle(ButtonStyle.Secondary);
    const label = o.label || fallbackLabel(o);
    if (label) button.setLabel(label);
    if (o.emoji) button.setEmoji(o.emoji);
    if (!label && !o.emoji) button.setLabel("Option");
    return button;
  });
  const components = Array.from({ length: Math.ceil(buttons.length / 5) }, (_, r) =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(r * 5, r * 5 + 5))
  );
  return { embeds, components };
}

// Edits the panel's already-posted message in place instead of posting a
// new one. Clears any reactions too, so a message adopted from a reaction
// panel that was switched to buttons/dropdown converts cleanly. Returns
// false if there's no live message to edit — the caller then clears
// messageId and the poster below sends a fresh one.
export async function refreshRolePanel(client: Client, panelId: string): Promise<boolean> {
  const panel = await prisma.rolePanel.findUnique({ where: { id: panelId } });
  if (!panel?.messageId) return false;
  const channel = await client.channels.fetch(panel.channelId).catch(() => null);
  if (!isSendableChannel(channel)) return false;
  const message = await channel.messages.fetch(panel.messageId).catch(() => null);
  if (!message) return false;

  const payload = await buildPayload(client, panel);
  if (!payload) return false;
  const edited = await message.edit({ content: "", ...payload }).catch((err) => {
    logError("bot", err, panel.guildId);
    return null;
  });
  if (!edited) return false;

  if (edited.reactions.cache.size > 0) {
    // Needs Manage Messages; without it, at least remove the bot's own.
    await edited.reactions.removeAll().catch(async () => {
      for (const reaction of edited.reactions.cache.values()) {
        if (client.user) await reaction.users.remove(client.user.id).catch(() => null);
      }
    });
  }
  return true;
}

// Posts the button/dropdown panel for any RolePanel that doesn't have a
// live message yet (created just now, moved to another channel, or its old
// message is gone).
export function startRolePanelPosterJob(client: Client) {
  cron.schedule("*/5 * * * * *", async () => {
    let loggedThisTick = 0;
    const pending = await prisma.rolePanel.findMany({ where: { messageId: null }, take: 20 });

    for (const panel of pending) {
      if (!(await isModuleEnabled(panel.guildId, "REACTION_ROLES"))) continue;

      const channel = await client.channels.fetch(panel.channelId).catch(() => null);
      if (!isSendableChannel(channel)) continue;

      const payload = await buildPayload(client, panel);
      if (!payload) continue;

      const message = await channel.send(payload).catch((err) => {
        if (loggedThisTick < 5) { logError("bot", err, panel.guildId); loggedThisTick++; }
        return null;
      });
      if (message) await prisma.rolePanel.update({ where: { id: panel.id }, data: { messageId: message.id } });
    }
  });
}
