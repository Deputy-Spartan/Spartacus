import { Router, type Request, type Response, type NextFunction } from "express";
import { Prisma, prisma } from "@spartacus/db";
import { DAILY_POST_KINDS, builtInDailyPosts, parsePostTime, zonedClock, type DailyPostKind } from "@spartacus/shared";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { ownedByGuild } from "../middleware/ownedByGuild";
import { getBotClient } from "../lib/botClient";

const router = Router();

const DEFAULT_CONFIG = {
  enabled: false,
  channelId: null as string | null,
  pingRoleId: null as string | null,
  postTime: "09:00",
  timeZone: "UTC",
  days: [0, 1, 2, 3, 4, 5, 6],
  order: "RANDOM",
  useBuiltIn: true,
  createThread: false,
  creatorData: null,
  savedEmbedId: null as string | null,
  lastPostedOn: null as string | null,
  postCount: 0,
};

const MAX_ENTRIES = 1000;
const MAX_TEXT = 1500;
const MAX_AUTHOR = 150;

function requireKind(req: Request, res: Response, next: NextFunction) {
  req.params.kind = String(req.params.kind).toUpperCase();
  if (!DAILY_POST_KINDS.includes(req.params.kind as DailyPostKind)) return res.status(400).json({ error: "Unknown feed. Use quote or question." });
  next();
}

function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || !zone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

async function loadFeed(guildId: string, kind: DailyPostKind) {
  const [config, entries] = await Promise.all([
    prisma.dailyPostConfig.findUnique({ where: { guildId_kind: { guildId, kind } } }),
    prisma.dailyPostEntry.findMany({ where: { guildId, kind }, orderBy: { createdAt: "asc" } }),
  ]);
  return { config: config ?? { guildId, kind, ...DEFAULT_CONFIG }, entries, builtInCount: builtInDailyPosts(kind).length };
}

router.get("/guilds/:guildId/daily-posts/:kind", requireAuth, requireGuildPermission, requireKind, async (req, res) => {
  res.json(await loadFeed(req.params.guildId, req.params.kind as DailyPostKind));
});

router.put("/guilds/:guildId/daily-posts/:kind", requireAuth, requireGuildPermission, requireKind, async (req, res) => {
  const { guildId } = req.params;
  const kind = req.params.kind as DailyPostKind;
  const body = req.body as Record<string, unknown>;
  const existing = await prisma.dailyPostConfig.findUnique({ where: { guildId_kind: { guildId, kind } } });

  const postTime = typeof body.postTime === "string" && /^\d{1,2}:\d{2}$/.test(body.postTime) ? body.postTime : existing?.postTime ?? DEFAULT_CONFIG.postTime;
  const timeZone = isValidTimeZone(body.timeZone) ? body.timeZone : existing?.timeZone ?? DEFAULT_CONFIG.timeZone;
  const days = Array.isArray(body.days) ? [...new Set(body.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : DEFAULT_CONFIG.days;
  const enabled = Boolean(body.enabled);

  // Turning a feed on, or moving its time, after today's time has already
  // gone by would post the moment it's saved. Starting tomorrow is what
  // people expect, and Post Now is there for sending one right away.
  const clock = zonedClock(timeZone);
  const scheduleChanged = !existing || !existing.enabled || existing.postTime !== postTime || existing.timeZone !== timeZone;
  const skipToday = enabled && scheduleChanged && clock.minutes >= parsePostTime(postTime) && existing?.lastPostedOn !== clock.date;

  const data = {
    enabled,
    channelId: (body.channelId as string | null) || null,
    pingRoleId: (body.pingRoleId as string | null) || null,
    postTime,
    timeZone,
    days,
    order: body.order === "IN_ORDER" ? "IN_ORDER" : "RANDOM",
    useBuiltIn: body.useBuiltIn !== false,
    createThread: Boolean(body.createThread),
    creatorData: body.creatorData ? (body.creatorData as Prisma.InputJsonValue) : Prisma.JsonNull,
    savedEmbedId: (body.savedEmbedId as string | null) || null,
    ...(skipToday ? { lastPostedOn: clock.date } : {}),
  };

  const row = await prisma.dailyPostConfig.upsert({
    where: { guildId_kind: { guildId, kind } },
    create: { guildId, kind, ...data },
    update: data,
  });
  res.json(row);
});

// Adds one entry ({ text, author }) or many at once ({ items: [...] }).
router.post("/guilds/:guildId/daily-posts/:kind/entries", requireAuth, requireGuildPermission, requireKind, async (req, res) => {
  const { guildId } = req.params;
  const kind = req.params.kind as DailyPostKind;
  const raw: Array<{ text?: unknown; author?: unknown }> = Array.isArray(req.body?.items) ? req.body.items : [req.body ?? {}];

  const items = raw
    .map((i) => ({
      text: String(i.text ?? "").trim().slice(0, MAX_TEXT),
      author: kind === "QUOTE" ? String(i.author ?? "").trim().slice(0, MAX_AUTHOR) || null : null,
    }))
    .filter((i) => i.text);
  if (items.length === 0) return res.status(400).json({ error: kind === "QUOTE" ? "Type a quote first." : "Type a question first." });

  const count = await prisma.dailyPostEntry.count({ where: { guildId, kind } });
  if (count + items.length > MAX_ENTRIES) return res.status(400).json({ error: `A list can hold up to ${MAX_ENTRIES} entries. Remove some before adding more.` });

  // One at a time so createdAt keeps the order they were typed in, which is
  // the order "In order" posts them.
  for (const item of items) await prisma.dailyPostEntry.create({ data: { guildId, kind, ...item } });
  res.status(201).json(await loadFeed(guildId, kind));
});

router.patch("/guilds/:guildId/daily-posts/:kind/entries/:id", requireAuth, requireGuildPermission, requireKind, ownedByGuild("dailyPostEntry"), async (req, res) => {
  const kind = req.params.kind as DailyPostKind;
  const text = String(req.body?.text ?? "").trim().slice(0, MAX_TEXT);
  if (!text) return res.status(400).json({ error: "This can't be empty." });
  const author = kind === "QUOTE" ? String(req.body?.author ?? "").trim().slice(0, MAX_AUTHOR) || null : null;
  const row = await prisma.dailyPostEntry.update({ where: { id: req.params.id }, data: { text, author } });
  res.json(row);
});

router.delete("/guilds/:guildId/daily-posts/:kind/entries/:id", requireAuth, requireGuildPermission, requireKind, ownedByGuild("dailyPostEntry"), async (req, res) => {
  await prisma.dailyPostEntry.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// Starts the list over, so entries that already posted can come up again.
router.post("/guilds/:guildId/daily-posts/:kind/reset", requireAuth, requireGuildPermission, requireKind, async (req, res) => {
  const { guildId } = req.params;
  const kind = req.params.kind as DailyPostKind;
  await prisma.dailyPostEntry.updateMany({ where: { guildId, kind }, data: { usedAt: null } });
  await prisma.dailyPostConfig.updateMany({ where: { guildId, kind }, data: { usedBuiltIn: [] } });
  res.json(await loadFeed(guildId, kind));
});

// { test: true } sends a marked test that doesn't use up an entry. Without
// it, this is Post Now, which counts as today's post.
router.post("/guilds/:guildId/daily-posts/:kind/send", requireAuth, requireGuildPermission, requireKind, async (req, res) => {
  const client = getBotClient();
  if (!client) return res.status(503).json({ error: "The bot isn't connected right now. Try again in a moment." });

  const { sendDailyPost } = await import("@spartacus/bot");
  const result = await sendDailyPost(client, req.params.guildId, req.params.kind as DailyPostKind, { isTest: Boolean(req.body?.test) });
  if (!result.ok) return res.status(400).json({ error: result.error ?? "Failed to send." });
  res.json({ ok: true });
});

export default router;
