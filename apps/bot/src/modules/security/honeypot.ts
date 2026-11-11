import cron from "node-cron";
import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, Client, EmbedBuilder, Events, GuildMember, Message, PermissionFlagsBits } from "discord.js";
import type { HoneypotConfig } from "@prisma/client";
import { logError } from "@spartacus/db";
import {
  HONEYPOT_ACTION_INFO,
  defaultHoneypotMessage,
  honeypotAction,
  honeypotCounterLabel,
  honeypotTokenValues,
  type HoneypotAction,
  type HoneypotStats,
} from "@spartacus/shared";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { isSendableChannel } from "../../lib/channels";
import { logCase } from "../../lib/cases";
import { withLock } from "../../lib/lock";
import { resolveSavedEmbed, buildSavedEmbedPayload, type SavedEmbedData } from "../../lib/savedEmbedRender";

export const name = Events.MessageCreate;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const REASON = "Honeypot channel triggered";

// This server's numbers and the totals across every server.
export async function getHoneypotStats(guildId: string): Promise<HoneypotStats> {
  const [server, week, global, servers] = await Promise.all([
    prisma.honeypotCatch.count({ where: { guildId } }),
    prisma.honeypotCatch.count({ where: { guildId, createdAt: { gte: new Date(Date.now() - WEEK_MS) } } }),
    prisma.honeypotCatch.count(),
    prisma.moduleToggle.count({ where: { key: "HONEYPOT", enabled: true, guild: { honeypotConfig: { channelId: { not: null } } } } }),
  ]);
  return { server, week, global, servers };
}

// Returns true when the member was actually dealt with.
async function punish(member: GuildMember, action: HoneypotAction, timeoutMinutes: number): Promise<boolean> {
  const ok = () => true;
  const failed = () => false;
  if (action === "KICK") return member.kickable ? member.kick(REASON).then(ok, failed) : false;
  if (action === "TIMEOUT") return member.moderatable ? member.timeout(Math.min(Math.max(timeoutMinutes, 1), 40320) * 60_000, REASON).then(ok, failed) : false;
  if (!member.bannable) return false;
  // A day of deleted messages clears whatever else the account spammed.
  const banned = await member.ban({ reason: REASON, deleteMessageSeconds: 86400 }).then(ok, failed);
  if (banned && action === "SOFTBAN") await member.guild.members.unban(member.id, "Honeypot soft ban").catch(() => null);
  return banned;
}

export async function execute(message: Message) {
  if (message.author.bot || !message.guildId) return;
  const enabled = await isModuleEnabled(message.guildId, "HONEYPOT");
  if (!enabled) return;

  const config = await prisma.honeypotConfig.findUnique({ where: { guildId: message.guildId } });
  if (!config?.channelId || message.channelId !== config.channelId) return;

  const member = await message.guild?.members.fetch(message.author.id).catch(() => null);
  // Staff can post here to test or explain it.
  if (!member || member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

  const action = honeypotAction(config.action);
  if (config.deleteMessage) await message.delete().catch(() => null);
  // Someone the bot can't touch isn't counted as caught.
  if (!(await punish(member, action, config.timeoutMinutes))) return;

  await prisma.honeypotCatch.create({ data: { guildId: message.guildId, userId: message.author.id, action } });
  await logCase({
    guildId: message.guildId,
    userId: message.author.id,
    action: action === "KICK" ? "KICK" : action === "TIMEOUT" ? "MUTE" : "BAN",
    reason: action === "SOFTBAN" ? `${REASON} (soft ban)` : REASON,
    moderatorId: message.client.user?.id ?? "system",
  });

  await syncHoneypotMessage(message.client, message.guildId).catch((err) => logError("bot", err, message.guildId ?? undefined));
}

async function buildMessage(client: Client, config: HoneypotConfig) {
  const stats = await getHoneypotStats(config.guildId);
  const tokens = honeypotTokenValues(config.action, stats, client.guilds.cache.get(config.guildId)?.name ?? "this server");
  const saved = await resolveSavedEmbed(config.savedEmbedId);
  const data = saved ?? (config.creatorData as SavedEmbedData | null) ?? (defaultHoneypotMessage() as unknown as SavedEmbedData);
  const payload = await buildSavedEmbedPayload(config.guildId, data, tokens);

  const buttons: ButtonBuilder[] = [];
  if (config.showCounter) {
    buttons.push(new ButtonBuilder().setCustomId("honeypot:count").setLabel(honeypotCounterLabel(config.action, config.counterScope, stats).slice(0, 80)).setStyle(ButtonStyle.Secondary).setDisabled(true));
  }
  if (config.showStatsButton) buttons.push(new ButtonBuilder().setCustomId("honeypot:stats").setLabel("Honeypot Stats").setEmoji("📊").setStyle(ButtonStyle.Secondary));

  const components = [...(payload.components ?? []).slice(0, buttons.length ? 4 : 5), ...(buttons.length ? [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)] : [])];
  const hasEmbeds = Array.isArray(payload.embeds) && payload.embeds.length > 0;
  const content = payload.content || (hasEmbeds ? "" : "🍯 Do not post in this channel. Anything sent here gets the sender removed.");
  return { content, embeds: payload.embeds ?? [], components };
}

// Posts the honeypot's warning message, or edits the one already there so its
// counter stays current. Removes it when the message is switched off or the
// channel changed. Runs one at a time per server so two catches landing
// together can't post it twice.
export function syncHoneypotMessage(client: Client, guildId: string): Promise<{ ok: boolean; error?: string }> {
  return withLock(`honeypot:${guildId}`, async () => {
    const config = await prisma.honeypotConfig.findUnique({ where: { guildId } });
    if (!config) return { ok: true };

    const wanted = config.messageEnabled && !!config.channelId && (await isModuleEnabled(guildId, "HONEYPOT"));
    const channel = config.channelId ? await client.channels.fetch(config.channelId).catch(() => null) : null;
    const existing = config.messageId && isSendableChannel(channel) ? await channel.messages.fetch(config.messageId).catch(() => null) : null;

    if (!wanted) {
      if (existing) await existing.delete().catch(() => null);
      if (config.messageId) await prisma.honeypotConfig.update({ where: { id: config.id }, data: { messageId: null } });
      return { ok: true };
    }
    if (!isSendableChannel(channel)) return { ok: false, error: "I can't post in the honeypot channel. Check that I can see it and send messages there." };

    const payload = await buildMessage(client, config);
    if (existing) {
      const edited = await existing.edit(payload).catch((err) => void logError("bot", err, guildId));
      return edited ? { ok: true } : { ok: false, error: "Discord rejected the message. Check the Discord Limits card." };
    }
    const sent = await channel.send(payload).catch((err) => void logError("bot", err, guildId));
    if (!sent) return { ok: false, error: "Discord rejected the message. Check my permissions in that channel and the Discord Limits card." };
    await prisma.honeypotConfig.update({ where: { id: config.id }, data: { messageId: sent.id } });
    return { ok: true };
  });
}

// The message's Honeypot Stats button. Only the person who clicked sees it.
export async function handleHoneypotStats(interaction: ButtonInteraction) {
  if (!interaction.guildId) return;
  const [stats, config] = await Promise.all([getHoneypotStats(interaction.guildId), prisma.honeypotConfig.findUnique({ where: { guildId: interaction.guildId } })]);
  const info = HONEYPOT_ACTION_INFO[honeypotAction(config?.action)];
  const n = (value: number) => `**${value.toLocaleString("en-US")}**`;

  const embed = new EmbedBuilder()
    .setColor(0xf5a524)
    .setTitle("🍯 Honeypot Stats")
    .setDescription(`Anyone who posts in ${config?.channelId ? `<#${config.channelId}>` : "the honeypot channel"} is ${info.past} automatically. Spam bots and hacked accounts post everywhere, so they walk right into it.`)
    .addFields(
      { name: "This server", value: `Caught all time: ${n(stats.server)}\nCaught in the last 7 days: ${n(stats.week)}` },
      { name: "Every server", value: `Servers with a honeypot running: ${n(stats.servers)}\nCaught in total: ${n(stats.global)}` }
    )
    .setFooter({ text: "Live numbers" })
    .setTimestamp(new Date());
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// Catches in other servers move the all-server numbers, so every posted
// message is refreshed on a timer as well as after each local catch.
export function startHoneypotMessageJob(client: Client) {
  cron.schedule("*/10 * * * *", async () => {
    const configs = await prisma.honeypotConfig.findMany({ where: { messageEnabled: true, channelId: { not: null } }, select: { guildId: true }, take: 500 });
    for (const { guildId } of configs) {
      if (!client.guilds.cache.has(guildId)) continue;
      await syncHoneypotMessage(client, guildId).catch((err) => logError("bot", err, guildId));
    }
  });
}
