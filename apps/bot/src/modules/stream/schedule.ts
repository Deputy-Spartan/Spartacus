import { EmbedBuilder, GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel, type BaseMessageOptions, type Client, type Guild } from "discord.js";
import type { StreamExtrasConfig, StreamSlot } from "@prisma/client";
import { SCHEDULE_POST_DEFAULTS, SCHEDULE_TIPS, buildScheduleWeeks, cleanSlotPlatforms, describeRepeat, isValidTimezone, nextOccurrence, type ScheduleWeek } from "@spartacus/shared";
import { resolveSavedEmbed, buildSavedEmbedPayload } from "../../lib/savedEmbedRender";
import { createHash } from "node:crypto";
import { logError } from "@spartacus/db";
import { prisma } from "../../lib/prisma";
import { isSendableChannel } from "../../lib/channels";
import { isModuleEnabled } from "../../lib/moduleGate";

// The stream schedule: one post per week (the active week at the bottom, later
// weeks stacked above it), kept up to date in place, and (if switched on) a
// Discord event for each streamer's next slot so members can tap "Interested".

type ScheduleConfig = Pick<StreamExtrasConfig, "guildId" | "scheduleTimezone" | "scheduleEmbedId"> & { scheduleWeeksAhead?: number };

// One week's post: the look built in the dashboard (or a library embed, or the
// default), with that week's days added under its first embed.
async function weekPayload(config: ScheduleConfig, week: ScheduleWeek, tz: string): Promise<BaseMessageOptions> {
  const tokens: Record<string, string> = {
    "{timezone}": tz,
    "{when}": week.when,
    "{week}": week.label,
    "{count}": `${week.total} stream${week.total === 1 ? "" : "s"}`,
    // The tips only go on the active week, the bottom post.
    "{tips}": week.index === 0 ? SCHEDULE_TIPS : "",
  };
  const design = await resolveSavedEmbed(config.scheduleEmbedId);
  const built = design ? await buildSavedEmbedPayload(config.guildId, design, tokens) : null;
  let first: EmbedBuilder;
  const rest: EmbedBuilder[] = [];
  if (built?.embeds?.length) {
    first = EmbedBuilder.from(built.embeds[0] as EmbedBuilder);
    for (const e of built.embeds.slice(1)) rest.push(EmbedBuilder.from(e as EmbedBuilder));
  } else {
    const d = SCHEDULE_POST_DEFAULTS;
    const fill = (s: string) => Object.entries(tokens).reduce((out, [k, v]) => out.split(k).join(v), s);
    first = new EmbedBuilder().setColor((week.index === 0 ? "#5865F2" : "#7B99BC") as `#${string}`).setTitle(fill(d.title)).setDescription(fill(d.description));
    if (d.footer) first.setFooter({ text: fill(d.footer) });
  }
  const room = 25 - (first.data.fields?.length ?? 0);
  if (room > 0) first.addFields(week.fields.slice(0, room));
  return { content: built?.content || undefined, embeds: [first, ...rest].slice(0, 10), components: built?.components ?? [], allowedMentions: { parse: [] as never[] } };
}

// Every week's post, active week first.
export async function schedulePayloads(config: ScheduleConfig, slots: StreamSlot[]): Promise<BaseMessageOptions[]> {
  const tz = isValidTimezone(config.scheduleTimezone) ? config.scheduleTimezone : "UTC";
  const weeks = buildScheduleWeeks(slots, tz, config.scheduleWeeksAhead ?? 1);
  return Promise.all(weeks.map((w) => weekPayload(config, w, tz)));
}

// Kept for /schedule view and anything that wants one message: the active week.
export async function schedulePayload(config: ScheduleConfig, slots: StreamSlot[]): Promise<BaseMessageOptions> {
  return (await schedulePayloads({ ...config, scheduleWeeksAhead: 0 }, slots))[0];
}

const idList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

// The week posts. Posted once in reverse (the furthest week first, so the
// active week ends up at the bottom), then edited in place, so as weeks finish
// everything moves up a post without reposting. Only reposted when the number
// of weeks changes or a post was deleted.
export async function refreshSchedule(client: Client, guildId: string, force = false): Promise<{ ok: boolean; error?: string }> {
  const config = await prisma.streamExtrasConfig.findUnique({ where: { guildId } });
  if (!config?.scheduleChannelId) return { ok: false, error: "Pick a schedule channel first." };
  const slots = await prisma.streamSlot.findMany({ where: { guildId }, orderBy: [{ dayOfWeek: "asc" }, { startMinutes: "asc" }] });
  const ids = idList(config.scheduleMessageIds);
  const hash = createHash("sha1")
    // The hour is in it so "Today" and the weeks move along by themselves.
    .update(JSON.stringify([config.scheduleTimezone, config.scheduleEmbedId, config.scheduleWeeksAhead, new Date().toISOString().slice(0, 13), slots.map((s) => [s.id, s.streamer, s.title, s.link, s.dayOfWeek, s.startMinutes, s.durationMin, s.repeat, s.startDate, s.streamTitle, s.message, s.platforms])]))
    .digest("hex");
  if (!force && hash === config.scheduleHash && ids.length) return { ok: true };
  const channel = await client.channels.fetch(config.scheduleChannelId).catch(() => null);
  if (!isSendableChannel(channel) || !("messages" in channel)) return { ok: false, error: "Spartacus can't post in the schedule channel." };

  // Top to bottom: the furthest week first, the active week last.
  const ordered = (await schedulePayloads(config, slots)).reverse();

  let kept = ids.length === ordered.length;
  if (kept) {
    for (let i = 0; i < ordered.length && kept; i++) {
      const msg = await channel.messages.fetch(ids[i]).catch(() => null);
      if (!msg || !(await msg.edit(ordered[i]).then(() => true).catch(() => false))) kept = false;
    }
  }
  let newIds = ids;
  if (!kept) {
    // Clear the old posts (and the single post from before) and post them fresh, in order.
    for (const id of new Set([...ids, ...(config.scheduleMessageId ? [config.scheduleMessageId] : [])])) {
      const old = await channel.messages.fetch(id).catch(() => null);
      await old?.delete().catch(() => null);
    }
    newIds = [];
    for (const payload of ordered) {
      const msg = await channel.send(payload).catch((err) => {
        logError("bot", err, guildId);
        return null;
      });
      if (!msg) return { ok: false, error: "Discord wouldn't take the post." };
      newIds.push(msg.id);
    }
    // Pin the active week (the bottom post).
    const bottom = await channel.messages.fetch(newIds[newIds.length - 1]).catch(() => null);
    await bottom?.pin().catch(() => null);
  }
  await prisma.streamExtrasConfig.update({
    where: { id: config.id },
    data: { scheduleMessageIds: newIds, scheduleMessageId: newIds[newIds.length - 1] ?? null, scheduleHash: hash },
  });
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