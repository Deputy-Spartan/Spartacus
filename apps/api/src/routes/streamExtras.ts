import { Router } from "express";
import { Prisma, prisma } from "@spartacus/db";
import { REPEAT_NEEDS_DATE, STREAM_EXTRAS_DEFAULTS, cleanRepeat, cleanScheduleDate, cleanSlotPlatforms, dayOfDate, isValidTimezone } from "@spartacus/shared";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { getBotClient } from "../lib/botClient";

const router = Router();
const id = (v: unknown) => (typeof v === "string" && /^\d{15,25}$/.test(v) ? v : null);
const int = (v: unknown, min: number, max: number, fallback: number) => (Number.isFinite(Number(v)) ? Math.max(min, Math.min(max, Math.round(Number(v)))) : fallback);
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

router.get("/guilds/:guildId/stream-extras", requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const [config, slots, clips, links, subs] = await Promise.all([
    prisma.streamExtrasConfig.findUnique({ where: { guildId } }),
    prisma.streamSlot.findMany({ where: { guildId }, orderBy: [{ dayOfWeek: "asc" }, { startMinutes: "asc" }] }),
    prisma.streamClip.findMany({ where: { guildId }, orderBy: { clippedAt: "desc" }, take: 15 }),
    prisma.streamLink.findMany({ where: { guildId }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.streamSubscription.count({ where: { guildId, platform: "twitch" } }),
  ]);
  const guild = getBotClient()?.guilds.cache.get(guildId);
  res.json({
    config: config ?? { guildId, ...STREAM_EXTRAS_DEFAULTS },
    slots,
    clips,
    links: links.map((l) => ({ id: l.id, userId: l.userId, name: guild?.members.cache.get(l.userId)?.displayName ?? null, handle: l.handle, verified: l.verified, createdAt: l.createdAt })),
    twitchStreamers: subs,
    twitchKeys: !!(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET),
  });
});

router.put("/guilds/:guildId/stream-extras", requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const k of ["clipsChannelId", "scheduleChannelId"]) if (k in b) data[k] = id(b[k]);
  for (const k of ["clipsEnabled", "clipsWeekly", "scheduleCreateEvents", "scheduleWeekAhead", "rewardsEnabled"]) if (typeof b[k] === "boolean") data[k] = b[k];
  if ("clipsMinViews" in b) data.clipsMinViews = int(b.clipsMinViews, 0, 100000, 0);
  if ("clipsWeeklyDay" in b) data.clipsWeeklyDay = int(b.clipsWeeklyDay, 0, 6, 0);
  if ("rewardCoins" in b) data.rewardCoins = int(b.rewardCoins, 0, 100000, 10);
  if ("rewardXp" in b) data.rewardXp = int(b.rewardXp, 0, 100000, 10);
  if ("rewardIntervalMin" in b) data.rewardIntervalMin = int(b.rewardIntervalMin, 5, 120, 10);
  if ("rewardDailyCoinCap" in b) data.rewardDailyCoinCap = int(b.rewardDailyCoinCap, 0, 10_000_000, 200);
  if ("scheduleEmbedId" in b) data.scheduleEmbedId = typeof b.scheduleEmbedId === "string" && b.scheduleEmbedId ? b.scheduleEmbedId.slice(0, 40) : null;
  if ("scheduleTimezone" in b) data.scheduleTimezone = typeof b.scheduleTimezone === "string" && isValidTimezone(b.scheduleTimezone) ? b.scheduleTimezone : "UTC";
  // A new schedule channel gets a fresh message there.
  const before = await prisma.streamExtrasConfig.findUnique({ where: { guildId } });
  if ("scheduleChannelId" in data && data.scheduleChannelId !== before?.scheduleChannelId) {
    data.scheduleMessageId = null;
    data.scheduleHash = null;
  }
  const config = await prisma.streamExtrasConfig.upsert({ where: { guildId }, create: { guildId, ...data }, update: data });
  const touchedSchedule = ["scheduleChannelId", "scheduleTimezone", "scheduleCreateEvents", "scheduleEmbedId", "scheduleWeekAhead"].some((k) => k in data && (data as Record<string, unknown>)[k] !== (before as Record<string, unknown> | null)?.[k]);
  const client = getBotClient();
  let scheduleNote: string | null = null;
  if (touchedSchedule && client) {
    const { updateSchedule } = await import("@spartacus/bot");
    const r = await updateSchedule(client, guildId, true);
    scheduleNote = r.message.ok ? r.eventProblem : (r.message.error ?? null);
  }
  res.json({ config, scheduleNote });
});

function slotData(b: Record<string, unknown>) {
  const repeat = cleanRepeat(b.repeat);
  const date = cleanScheduleDate(b.startDate);
  const platforms = cleanSlotPlatforms(b.platforms);
  const link = typeof b.link === "string" && /^https?:\/\//i.test(b.link) ? b.link.slice(0, 200) : (platforms.find((p) => p.link)?.link ?? null);
  return {
    streamer: text(b.streamer, 60) ?? "Streamer",
    userId: id(b.userId),
    title: text(b.title, 80),
    streamTitle: text(b.streamTitle, 100),
    message: text(b.message, 500),
    link,
    platforms: platforms as unknown as Prisma.InputJsonValue,
    repeat,
    startDate: REPEAT_NEEDS_DATE.has(repeat) ? date : null,
    // A date-based stream's weekday comes from its date.
    dayOfWeek: REPEAT_NEEDS_DATE.has(repeat) && date ? dayOfDate(date) : int(b.dayOfWeek, 0, 6, 0),
    startMinutes: int(b.startMinutes, 0, 1439, 19 * 60),
    durationMin: int(b.durationMin, 15, 1440, 120),
  };
}
function slotProblem(d: ReturnType<typeof slotData>): string | null {
  if (REPEAT_NEEDS_DATE.has(d.repeat) && !d.startDate) return d.repeat === "ONCE" ? "Pick the date." : "Pick the date of the first stream.";
  return null;
}

async function refresh(guildId: string) {
  const client = getBotClient();
  if (!client) return null;
  const { updateSchedule } = await import("@spartacus/bot");
  const r = await updateSchedule(client, guildId, true);
  return r.message.ok ? r.eventProblem : (r.message.error ?? null);
}

router.post("/guilds/:guildId/stream-extras/slots", requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  if ((await prisma.streamSlot.count({ where: { guildId } })) >= 60) return res.status(400).json({ error: "The schedule is full (60 streams)." });
  const data = slotData(req.body ?? {});
  const problem = slotProblem(data);
  if (problem) return res.status(400).json({ error: problem });
  const slot = await prisma.streamSlot.create({ data: { guildId, ...data } });
  res.status(201).json({ slot, note: await refresh(guildId) });
});

router.put("/guilds/:guildId/stream-extras/slots/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.streamSlot.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== req.params.guildId) return res.status(404).json({ error: "Not found." });
  const data = slotData(req.body ?? {});
  const problem = slotProblem(data);
  if (problem) return res.status(400).json({ error: problem });
  const slot = await prisma.streamSlot.update({ where: { id: existing.id }, data: { ...data, discordEventId: existing.discordEventId } });
  res.json({ slot, note: await refresh(existing.guildId) });
});

router.delete("/guilds/:guildId/stream-extras/slots/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.streamSlot.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== req.params.guildId) return res.status(404).json({ error: "Not found." });
  const client = getBotClient();
  if (client) {
    const { removeStreamSlot } = await import("@spartacus/bot");
    await removeStreamSlot(client, existing.id);
  } else await prisma.streamSlot.delete({ where: { id: existing.id } });
  res.json({ note: await refresh(existing.guildId) });
});

router.post("/guilds/:guildId/stream-extras/refresh-schedule", requireAuth, requireGuildPermission, async (req, res) => {
  const client = getBotClient();
  if (!client) return res.status(503).json({ error: "The bot isn't connected right now — try again in a moment." });
  const { updateSchedule } = await import("@spartacus/bot");
  const r = await updateSchedule(client, req.params.guildId, true);
  if (!r.message.ok) return res.status(400).json({ error: r.message.error });
  res.json({ ok: true, note: r.eventProblem });
});

router.post("/guilds/:guildId/stream-extras/clip-of-the-week", requireAuth, requireGuildPermission, async (req, res) => {
  const client = getBotClient();
  if (!client) return res.status(503).json({ error: "The bot isn't connected right now — try again in a moment." });
  const config = await prisma.streamExtrasConfig.findUnique({ where: { guildId: req.params.guildId } });
  if (!config?.clipsChannelId) return res.status(400).json({ error: "Pick a clips channel first." });
  const { postClipOfTheWeek } = await import("@spartacus/bot");
  await postClipOfTheWeek(client, { guildId: req.params.guildId });
  res.json({ ok: true });
});

router.delete("/guilds/:guildId/stream-extras/links/:id", requireAuth, requireGuildPermission, async (req, res) => {
  await prisma.streamLink.deleteMany({ where: { id: req.params.id, guildId: req.params.guildId } });
  res.status(204).send();
});

export default router;
