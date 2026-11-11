import cron from "node-cron";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder } from "discord.js";
import { PROFILE_PANEL_DEFAULTS } from "@spartacus/shared";
import { logError } from "@spartacus/db";
import { prisma } from "../lib/prisma";
import { isSendableChannel } from "../lib/channels";
import { isModuleEnabled } from "../lib/moduleGate";

// Posts the Profile Cards button panel where one is set up but not posted
// yet (a new channel, or new text, clears panelMessageId).
export async function postProfilePanel(client: Client, guildId: string): Promise<string | null> {
  const s = await prisma.profileCardSettings.findUnique({ where: { guildId } });
  if (!s?.panelChannelId || s.panelMessageId) return null;
  if (!(await isModuleEnabled(guildId, "PROFILE_CARDS"))) return "Turn on the Profile Cards module first.";
  const channel = await client.channels.fetch(s.panelChannelId).catch(() => null);
  if (!isSendableChannel(channel)) return "Spartacus can't post in that channel. Check it can see the channel and send messages there.";
  const color = /^#[0-9a-f]{6}$/i.test(s.panelColor ?? "") ? (s.panelColor as `#${string}`) : (PROFILE_PANEL_DEFAULTS.panelColor as `#${string}`);
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle((s.panelTitle || PROFILE_PANEL_DEFAULTS.panelTitle).slice(0, 256))
    .setDescription((s.panelText || PROFILE_PANEL_DEFAULTS.panelText).slice(0, 4000));
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("pcard:mine").setLabel("My card").setEmoji("🪪").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("pcard:pick").setLabel("Someone's card").setEmoji("🔍").setStyle(ButtonStyle.Secondary)
  );
  const message = await channel.send({ embeds: [embed], components: [row] }).catch((err) => {
    logError("bot", err, guildId);
    return null;
  });
  if (!message) return "Discord refused the panel. Check Spartacus can send messages and embeds in that channel.";
  // Only record it if nothing changed meanwhile (so a quick second save doesn't leave two panels).
  const saved = await prisma.profileCardSettings.updateMany({ where: { guildId, panelChannelId: s.panelChannelId, panelMessageId: null }, data: { panelMessageId: message.id } });
  if (saved.count === 0) await message.delete().catch(() => null);
  return null;
}

export function startProfilePanelPosterJob(client: Client) {
  cron.schedule("* * * * *", async () => {
    const pending = await prisma.profileCardSettings
      .findMany({ where: { panelChannelId: { not: null }, panelMessageId: null }, select: { guildId: true }, take: 20 })
      .catch(() => []);
    for (const p of pending) await postProfilePanel(client, p.guildId).catch(() => null);
  });
}
