import { EmbedBuilder, GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel, type Client, type Guild } from "discord.js";
import type { StreamExtrasConfig, StreamSlot } from "@prisma/client";
import { DAY_NAMES, buildScheduleText, formatTimeOfDay, isValidTimezone, nextSlotStart } from "@spartacus/shared";
import { createHash } from "node:crypto";
import { logError } from "@spartacus/db";
import { prisma } from "../../lib/prisma";
import { isSendableChannel } from "../../lib/channels";
import { isModuleEnabled } from "../../lib/moduleGate";

// The weekly stream schedule: one message that keeps itself up to date, and
// (if switched on) a Discord event for each streamer's next slot so members can
// tap "Interested" and get a reminder.

export function scheduleEmbed(config: Pick<StreamExtrasConfig, "scheduleTimezone">, slots: StreamSlot[]) {
  const tz = isValidTimezone(config.scheduleTimezone) ? config.scheduleTimezone : "UTC";
  const days = buildScheduleText(slots, tz);
  const embed = new EmbedBuilder()
    .setColor("#5865F2")
    .setTitle("📅 Stream Schedule")
    .setDescription(days.length ? "Every time below shows in **your own** time zone." : "No streams are scheduled yet. Streamers can add theirs with `/schedule add`.")
    .setFooter({ text: `Set in ${tz}` });
  for (const d of days) embed.addFields({ name: d.day, value: d.value.slice(0, 1024) });
  return embed;
}

// The pinned message. Only edited when something changed (or once a day, so
// the time tags move to the coming week).
export async function refreshSchedule(client: Client, guildId: string, force = false): Promise<{ ok: boolean; error?: string }> {
  const config = await prisma.streamExtrasConfig.findUnique({ where: { guildId } });
  if (!config?.scheduleChannelId) return { ok: false, error: "Pick a schedule channel first." };
  const slots = await prisma.streamSlot.findMany({ where: { guildId }, orderBy: [{ dayOfWeek: "asc" }, { startMinutes: "asc" }] });
  const hash = createHash("sha1")
    .update(JSON.stringify([config.scheduleTimezone, new Date().toISOString().slice(0, 10), slots.map((s) => [s.id, s.streamer, s.title, s.link, s.dayOfWeek, s.startMinutes])]))
    .digest("hex");
  if (!force && hash === config.scheduleHash && config.scheduleMessageId) return { ok: true };
  const channel = await client.channels.fetch(config.scheduleChannelId).catch(() => null);
  if (!isSendableChannel(channel)) return { ok: false, error: "Spartacus can't post in the schedule channel." };
  const payload = { embeds: [scheduleEmbed(config, slots)], allowedMentions: { parse: [] as never[] } };
  let message = config.scheduleMessageId && "messages" in channel ? await channel.messages.fetch(config.scheduleMessageId).catch(() => null) : null;
  if (message) await message.edit(payload).catch(() => (message = null));
  if (!message) {
    message = await channel.send(payload).catch((err) => {
      logError("bot", err, guildId);
      return null;
    });
    if (message) await message.pin().catch(() => null);
  }
  if (!message) return { ok: false, error: "Discord wouldn't take the post." };
  await prisma.streamExtrasConfig.update({ where: { id: config.id }, data: { scheduleMessageId: message.id, scheduleHash: hash } });
  return { ok: true };
}

async function dropEvent(guild: Guild, slot: StreamSlot) {
  if (!slot.discordEventId) return;
  await guild.scheduledEvents.delete(slot.discordEventId).catch(() => null);
  await prisma.streamSlot.update({ where: { id: slot.id }, data: { discordEventId: null, eventAt: null } }).catch(() => null);
}

// One Discord event per slot, always for its next start. Once that start has
// passed, the next week's is made. Turning it off removes them all.
export async function syncScheduleEvents(client: Client, guildId: string): Promise<string | null> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;
  const config = await prisma.streamExtrasConfig.findUnique({ where: { guildId } });
  const slots = await prisma.streamSlot.findMany({ where: { guildId } });
  if (!config?.scheduleCreateEvents) {
    for (const s of slots) await dropEvent(guild, s);
    return null;
  }
  const tz = isValidTimezone(config.scheduleTimezone) ? config.scheduleTimezone : "UTC";
  let problem: string | null = null;
  for (const slot of slots) {
    const next = nextSlotStart(tz, slot.dayOfWeek, slot.startMinutes);
    if (slot.discordEventId && slot.eventAt && slot.eventAt.getTime() === next.getTime()) continue;
    await dropEvent(guild, slot);
    const name = `${slot.streamer}${slot.title ? `: ${slot.title}` : ""}`.slice(0, 100);
    try {
      const event = await guild.scheduledEvents.create({
        name,
        scheduledStartTime: next,
        scheduledEndTime: new Date(next.getTime() + slot.durationMin * 60_000),
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType: GuildScheduledEventEntityType.External,
        entityMetadata: { location: (slot.link || "Live stream").slice(0, 100) },
        description: `${DAY_NAMES[slot.dayOfWeek]}s at ${formatTimeOfDay(slot.startMinutes)} (${tz})`.slice(0, 1000),
        reason: "Stream schedule",
      });
      await prisma.streamSlot.update({ where: { id: slot.id }, data: { discordEventId: event.id, eventAt: next } });
    } catch (err) {
      problem = err instanceof Error ? err.message : String(err);
      logError("bot", err, guildId);
    }
  }
  return problem;
}

export async function removeSlot(client: Client, slotId: string) {
  const slot = await prisma.streamSlot.findUnique({ where: { id: slotId } });
  if (!slot) return;
  const guild = client.guilds.cache.get(slot.guildId);
  if (guild) await dropEvent(guild, slot);
  await prisma.streamSlot.delete({ where: { id: slotId } }).catch(() => null);
}

// Everything after a change: the message, then the events.
export async function updateSchedule(client: Client, guildId: string, force = true) {
  const message = await refreshSchedule(client, guildId, force).catch((err) => ({ ok: false, error: String(err) }));
  const eventProblem = await syncScheduleEvents(client, guildId).catch((err) => String(err));
  return { message, eventProblem };
}

// Every 10 minutes: keeps the message fresh and makes next week's events.
export async function scheduleTick(client: Client) {
  const configs = await prisma.streamExtrasConfig.findMany({ where: { OR: [{ scheduleChannelId: { not: null } }, { scheduleCreateEvents: true }] } });
  for (const config of configs) {
    try {
      if (!(await isModuleEnabled(config.guildId, "STREAM_EXTRAS"))) continue;
      if (config.scheduleChannelId) await refreshSchedule(client, config.guildId);
      if (config.scheduleCreateEvents) await syncScheduleEvents(client, config.guildId);
    } catch (err) {
      logError("bot", err, config.guildId);
    }
  }
}
