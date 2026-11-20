import { EmbedBuilder, GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel, type BaseMessageOptions, type Client, type Guild } from "discord.js";
import type { StreamExtrasConfig, StreamSlot } from "@prisma/client";
import { SCHEDULE_POST_DEFAULTS, buildScheduleBoard, cleanSlotPlatforms, describeRepeat, isValidTimezone, nextOccurrence } from "@spartacus/shared";
import { resolveSavedEmbed, buildSavedEmbedPayload } from "../../lib/savedEmbedRender";
import { createHash } from "node:crypto";
import { logError } from "@spartacus/db";
import { prisma } from "../../lib/prisma";
import { isSendableChannel } from "../../lib/channels";
import { isModuleEnabled } from "../../lib/moduleGate";

// The weekly stream schedule: one message that keeps itself up to date, and
// (if switched on) a Discord event for each streamer's next slot so members can
// tap "Interested" and get a reminder.

// The schedule post: the look built in the dashboard (or a library embed, or
// the default), with the streams added under its first embed.
export async function schedulePayload(config: Pick<StreamExtrasConfig, "guildId" | "scheduleTimezone" | "scheduleEmbedId">, slots: StreamSlot[]): Promise<BaseMessageOptions> {
  const tz = isValidTimezone(config.scheduleTimezone) ? config.scheduleTimezone : "UTC";
  const fields = buildScheduleBoard(slots, tz);
  const design = await resolveSavedEmbed(config.scheduleEmbedId);
  const built = design ? await buildSavedEmbedPayload(config.guildId, design, { "{timezone}": tz }) : null;
  let first: EmbedBuilder;
  const rest: EmbedBuilder[] = [];
  if (built?.embeds?.length) {
    first = EmbedBuilder.from(built.embeds[0] as EmbedBuilder);
    for (const e of built.embeds.slice(1)) rest.push(EmbedBuilder.from(e as EmbedBuilder));
  } else {
    const d = SCHEDULE_POST_DEFAULTS;
    first = new EmbedBuilder().setColor(d.color as `#${string}`).setTitle(d.title).setDescription(d.description).setFooter({ text: d.footer.replace("{timezone}", tz) });
  }
  if (!fields.length) first.addFields({ name: "Nothing yet", value: "No streams are scheduled yet." });
  const room = 25 - (first.data.fields?.length ?? 0);
  if (room > 0) first.addFields(fields.slice(0, room));
  return { content: built?.content || undefined, embeds: [first, ...rest].slice(0, 10), components: built?.components ?? [], allowedMentions: { parse: [] as never[] } };
}

// The pinned message. Only edited when something changed (or every hour, so
// the days and times move along).
export async function refreshSchedule(client: Client, guildId: string, force = false): Promise<{ ok: boolean; error?: string }> {
  const config = await prisma.streamExtrasConfig.findUnique({ where: { guildId } });
  if (!config?.scheduleChannelId) return { ok: false, error: "Pick a schedule channel first." };
  const slots = await prisma.streamSlot.findMany({ where: { guildId }, orderBy: [{ dayOfWeek: "asc" }, { startMinutes: "asc" }] });
  const hash = createHash("sha1")
    // The hour is in it so "Today" and the next 7 days move along by themselves.
    .update(JSON.stringify([config.scheduleTimezone, config.scheduleEmbedId, new Date().toISOString().slice(0, 13), slots.map((s) => [s.id, s.streamer, s.title, s.link, s.dayOfWeek, s.startMinutes, s.durationMin, s.repeat, s.startDate, s.streamTitle, s.message, s.platforms])]))
    .digest("hex");
  if (!force && hash === config.scheduleHash && config.scheduleMessageId) return { ok: true };
  const channel = await client.channels.fetch(config.scheduleChannelId).catch(() => null);
  if (!isSendableChannel(channel)) return { ok: false, error: "Spartacus can't post in the schedule channel." };
  const payload = await schedulePayload(config, slots);
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
    const next = nextOccurrence(tz, slot);
    if (!next) {
      await dropEvent(guild, slot);
      continue;
    }
    if (slot.discordEventId && slot.eventAt && slot.eventAt.getTime() === next.getTime()) continue;
    await dropEvent(guild, slot);
    const name = `${slot.streamer}${slot.streamTitle || slot.title ? `: ${slot.streamTitle || slot.title}` : ""}`.slice(0, 100);
    const firstLink = slot.link || cleanSlotPlatforms(slot.platforms).find((p) => p.link)?.link || null;
    try {
      const event = await guild.scheduledEvents.create({
        name,
        scheduledStartTime: next,
        scheduledEndTime: new Date(next.getTime() + slot.durationMin * 60_000),
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType: GuildScheduledEventEntityType.External,
        entityMetadata: { location: (firstLink || "Live stream").slice(0, 100) },
        description: [slot.message, `${describeRepeat(slot)} (${tz})`].filter(Boolean).join("\n\n").slice(0, 1000),
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

// One-time streams that are over come off the schedule by themselves.
async function dropFinished(client: Client, guildId: string, tz: string): Promise<boolean> {
  const once = await prisma.streamSlot.findMany({ where: { guildId, repeat: "ONCE" } });
  let removed = false;
  for (const s of once) {
    if (nextOccurrence(tz, s, new Date(), s.durationMin * 60_000)) continue;
    await removeSlot(client, s.id);
    removed = true;
  }
  return removed;
}

// Every 10 minutes: keeps the message fresh, clears finished one-time streams
// and makes the next events.
export async function scheduleTick(client: Client) {
  const configs = await prisma.streamExtrasConfig.findMany({ where: { OR: [{ scheduleChannelId: { not: null } }, { scheduleCreateEvents: true }] } });
  for (const config of configs) {
    try {
      if (!(await isModuleEnabled(config.guildId, "STREAM_EXTRAS"))) continue;
      const tz = isValidTimezone(config.scheduleTimezone) ? config.scheduleTimezone : "UTC";
      const removed = await dropFinished(client, config.guildId, tz);
      if (config.scheduleChannelId) await refreshSchedule(client, config.guildId, removed);
      if (config.scheduleCreateEvents) await syncScheduleEvents(client, config.guildId);
    } catch (err) {
      logError("bot", err, config.guildId);
    }
  }
}
