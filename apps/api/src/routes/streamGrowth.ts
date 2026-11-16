import { Router, raw } from "express";
import { prisma } from "@spartacus/db";
import { CHECKLIST_MAX, DEFAULT_CHECKLIST, STREAM_GROWTH_DEFAULTS, cleanHandle, type LivePlatform } from "@spartacus/shared";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { getBotClient } from "../lib/botClient";

// Stream Growth: the dashboard page, connecting Twitch and Kick accounts
// (the sign-in comes back to /auth/stream/:platform/callback), and Kick's
// webhook for chat and follows.

const router = Router();
const id = (v: unknown) => (typeof v === "string" && /^\d{15,25}$/.test(v) ? v : null);
const int = (v: unknown, min: number, max: number, fallback: number) => (Number.isFinite(Number(v)) ? Math.max(min, Math.min(max, Math.round(Number(v)))) : fallback);
const bot = () => import("@spartacus/bot");
const noBot = { error: "The bot isn't connected right now — try again in a moment." };
const FRIEND_PLATFORMS = ["twitch", "kick", "youtube", "tiktok"];

router.get("/guilds/:guildId/stream-growth", requireAuth, requireGuildPermission, async (req: AuthedRequest, res) => {
  const guildId = req.params.guildId;
  const [config, friends, accounts, slots, nights, extras, leveling] = await Promise.all([
    prisma.streamGrowthConfig.findUnique({ where: { guildId } }),
    prisma.streamFriend.findMany({ where: { guildId }, orderBy: { createdAt: "asc" } }),
    prisma.streamerAccount.findMany({ where: { guildId }, orderBy: { createdAt: "asc" } }),
    prisma.streamSlot.count({ where: { guildId } }),
    prisma.gameNight.findMany({ where: { guildId, status: { in: ["OPEN", "TEAMS"] } }, orderBy: { startAt: "asc" }, take: 10 }),
    prisma.streamExtrasConfig.findUnique({ where: { guildId }, select: { scheduleTimezone: true } }),
    prisma.moduleToggle.findUnique({ where: { guildId_key: { guildId, key: "LEVELING" } }, select: { enabled: true } }).catch(() => null),
  ]);
  const client = getBotClient();
  const guild = client?.guilds.cache.get(guildId);
  const b = await bot();
  const top = client ? await b.topViewers(guildId, 5).catch(() => []) : [];
  const counts = nights.length ? await prisma.gameNightPlayer.groupBy({ by: ["gameNightId"], where: { gameNightId: { in: nights.map((n) => n.id) } }, _count: true }) : [];
  const name = (userId: string) => guild?.members.cache.get(userId)?.displayName ?? null;
  res.json({
    config: { ...STREAM_GROWTH_DEFAULTS, ...(config ?? { guildId }), checklist: config?.checklist?.length ? config.checklist : DEFAULT_CHECKLIST },
    friends,
    accounts: accounts.map((a) => ({ id: a.id, platform: a.platform, login: a.login, displayName: a.displayName, discordUserId: a.discordUserId, owner: name(a.discordUserId), mine: a.discordUserId === req.user?.id, createdAt: a.createdAt })),
    scheduledStreams: slots,
    timezone: extras?.scheduleTimezone ?? "UTC",
    gameNights: nights.map((n) => ({ id: n.id, game: n.game, startAt: n.startAt, host: name(n.hostId) ?? n.hostId, players: counts.find((c) => c.gameNightId === n.id)?._count ?? 0, teamSize: n.teamSize })),
    topViewers: top.map((t) => ({ ...t, name: name(t.userId) })),
    keys: { twitch: b.streamAccountKeys("twitch"), kick: b.streamAccountKeys("kick") },
    urls: { twitch: b.streamRedirectUri("twitch"), kick: b.streamRedirectUri("kick"), kickWebhook: `${b.apiBase()}/webhooks/kick` },
    ranks: { createdAt: config?.ranksCreatedAt ?? null, icons: guild ? guild.features.includes("ROLE_ICONS") : null, levelingOn: leveling?.enabled ?? false },
  });
});

router.put("/guilds/:guildId/stream-growth", requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const k of ["countdownChannelId", "pingRoleId", "raidChannelId", "boardChannelId", "recapChannelId", "votwChannelId", "votwRoleId", "gameNightChannelId", "gameNightRoleId", "clipSubmitChannelId"]) if (k in b) data[k] = id(b[k]);
  for (const k of ["countdownEnabled", "countdownHour", "countdownSoon", "friendAlerts", "raidListOnEnd", "recapEnabled", "recapLinkedOnly", "votwEnabled"]) if (typeof b[k] === "boolean") data[k] = b[k];
  if ("votwDay" in b) data.votwDay = int(b.votwDay, 0, 6, 1);
  if (Array.isArray(b.checklist)) {
    const list = b.checklist.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 60)).filter(Boolean).slice(0, CHECKLIST_MAX);
    // Saving the starting list as-is keeps following it if it changes later.
    data.checklist = list.join("\n") === DEFAULT_CHECKLIST.join("\n") ? [] : list;
  }
  const before = await prisma.streamGrowthConfig.findUnique({ where: { guildId } });
  // A new board channel gets a fresh message there.
  if ("boardChannelId" in data && data.boardChannelId !== before?.boardChannelId) {
    data.boardMessageId = null;
    data.boardHash = null;
  }
  const config = await prisma.streamGrowthConfig.upsert({ where: { guildId }, create: { guildId, ...data }, update: data });
  const client = getBotClient();
  if (client) {
    const m = await bot();
    if ("clipSubmitChannelId" in data) await m.refreshClipChannels().catch(() => null);
    if ("boardChannelId" in data && data.boardChannelId && data.boardChannelId !== before?.boardChannelId) await m.forceBoard(client, guildId).catch(() => null);
  }
  res.json({ config: { ...config, checklist: config.checklist.length ? config.checklist : DEFAULT_CHECKLIST } });
});

// ---- friends ----
router.post("/guilds/:guildId/stream-growth/friends", requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const platform = String(req.body?.platform ?? "");
  if (!FRIEND_PLATFORMS.includes(platform)) return res.status(400).json({ error: "Pick Twitch, Kick, YouTube or TikTok." });
  const handle = cleanHandle(platform as LivePlatform, String(req.body?.handle ?? ""));
  if (!handle || handle.length > 100) return res.status(400).json({ error: "Type their channel name or link." });
  if ((await prisma.streamFriend.count({ where: { guildId } })) >= 50) return res.status(400).json({ error: "The friends list is full (50)." });
  const displayName = typeof req.body?.displayName === "string" && req.body.displayName.trim() ? req.body.displayName.trim().slice(0, 60) : null;
  const friend = await prisma.streamFriend
    .create({ data: { guildId, platform, handle: platform === "twitch" || platform === "kick" ? handle.toLowerCase() : handle, displayName } })
    .catch(() => null);
  if (!friend) return res.status(400).json({ error: "They're already on the list." });
  res.status(201).json({ friend });
});

router.delete("/guilds/:guildId/stream-growth/friends/:id", requireAuth, requireGuildPermission, async (req, res) => {
  await prisma.streamFriend.deleteMany({ where: { id: req.params.id, guildId: req.params.guildId } });
  res.status(204).send();
});

router.post("/guilds/:guildId/stream-growth/friends/check", requireAuth, requireGuildPermission, async (req, res) => {
  const client = getBotClient();
  if (!client) return res.status(503).json(noBot);
  await (await bot()).pollFriends(client);
  res.json({ friends: await prisma.streamFriend.findMany({ where: { guildId: req.params.guildId }, orderBy: { createdAt: "asc" } }) });
});

// ---- connected accounts ----
router.post("/guilds/:guildId/stream-growth/connect/:platform", requireAuth, requireGuildPermission, async (req: AuthedRequest, res) => {
  const platform = req.params.platform;
  if (platform !== "twitch" && platform !== "kick") return res.status(400).json({ error: "Twitch or Kick only." });
  const r = (await bot()).startConnect(req.params.guildId, req.user!.id, platform);
  if (!r.url) return res.status(400).json({ error: r.error });
  res.json({ url: r.url });
});

router.delete("/guilds/:guildId/stream-growth/accounts/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const a = await prisma.streamerAccount.findUnique({ where: { id: req.params.id } });
  if (!a || a.guildId !== req.params.guildId) return res.status(404).json({ error: "Not found." });
  await (await bot()).disconnectStreamAccount(a.id);
  res.status(204).send();
});

router.post("/guilds/:guildId/stream-growth/accounts/:id/resubscribe", requireAuth, requireGuildPermission, async (req, res) => {
  const a = await prisma.streamerAccount.findUnique({ where: { id: req.params.id } });
  if (!a || a.guildId !== req.params.guildId || a.platform !== "kick") return res.status(404).json({ error: "Not found." });
  const problem = await (await bot()).subscribeKickEvents(a);
  if (problem) return res.status(400).json({ error: problem });
  res.json({ ok: true });
});

router.post("/guilds/:guildId/stream-growth/title", requireAuth, requireGuildPermission, async (req, res) => {
  const title = typeof req.body?.title === "string" && req.body.title.trim() ? req.body.title.trim().slice(0, 140) : null;
  const game = typeof req.body?.game === "string" && req.body.game.trim() ? req.body.game.trim().slice(0, 100) : null;
  if (!title && !game) return res.status(400).json({ error: "Type a title, a game, or both." });
  const ids = Array.isArray(req.body?.accountIds) ? (req.body.accountIds as unknown[]).filter((x): x is string => typeof x === "string") : null;
  const accounts = await prisma.streamerAccount.findMany({ where: { guildId: req.params.guildId, ...(ids ? { id: { in: ids } } : {}) } });
  if (!accounts.length) return res.status(400).json({ error: "Connect Twitch or Kick first." });
  const { setStreamTitle } = await bot();
  const results = [];
  for (const a of accounts) {
    const r = await setStreamTitle(a, title, game).catch((e: unknown) => ({ ok: false, error: String(e), game: null }));
    if (r.ok)
      await prisma.streamSubscription.updateMany({
        where: { guildId: a.guildId, platform: a.platform, channelName: { equals: a.login, mode: "insensitive" } },
        data: { ...(title ? { lastTitle: title } : {}), ...(r.game ? { lastGame: r.game } : {}) },
      });
    results.push({ platform: a.platform, login: a.login, ...r });
  }
  res.json({ results });
});

// ---- tests and one-off actions ----
router.post("/guilds/:guildId/stream-growth/test-countdown", requireAuth, requireGuildPermission, async (req, res) => {
  const client = getBotClient();
  if (!client) return res.status(503).json(noBot);
  const config = await prisma.streamGrowthConfig.findUnique({ where: { guildId: req.params.guildId } });
  if (!config?.countdownChannelId) return res.status(400).json({ error: "Pick a countdown channel first." });
  const r = await (await bot()).sendCountdown(client, config, { streamer: "Test Streamer", title: "Ranked grind", link: null, startsAt: new Date(Date.now() + 10 * 60_000), minutes: 10 }, true);
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json({ ok: true });
});

router.post("/guilds/:guildId/stream-growth/refresh-board", requireAuth, requireGuildPermission, async (req, res) => {
  const client = getBotClient();
  if (!client) return res.status(503).json(noBot);
  const r = await (await bot()).forceBoard(client, req.params.guildId);
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json({ ok: true });
});

router.post("/guilds/:guildId/stream-growth/votw-test", requireAuth, requireGuildPermission, async (req, res) => {
  const client = getBotClient();
  if (!client) return res.status(503).json(noBot);
  const config = await prisma.streamGrowthConfig.findUnique({ where: { guildId: req.params.guildId } });
  if (!config) return res.status(400).json({ error: "Save the settings first." });
  const r = await (await bot()).pickViewerOfTheWeek(client, config, true);
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json({ ok: true });
});

router.post("/guilds/:guildId/stream-growth/ranks", requireAuth, requireGuildPermission, async (req, res) => {
  const client = getBotClient();
  if (!client) return res.status(503).json(noBot);
  const r = await (await bot()).createRankRoles(client, req.params.guildId);
  if (r.error) return res.status(400).json({ error: r.error, ...r });
  res.json(r);
});

router.post("/guilds/:guildId/stream-growth/game-nights/:id/cancel", requireAuth, requireGuildPermission, async (req, res) => {
  const g = await prisma.gameNight.findUnique({ where: { id: req.params.id } });
  if (!g || g.guildId !== req.params.guildId) return res.status(404).json({ error: "Not found." });
  await prisma.gameNight.update({ where: { id: g.id }, data: { status: "CANCELED" } });
  res.json({ ok: true });
});

// ---- the sign-in coming back from Twitch or Kick (no dashboard session here;
// the one-time state from /connect says who and which server) ----
router.get("/auth/stream/:platform/callback", async (req, res) => {
  const platform = req.params.platform;
  const dash = (process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "");
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if ((platform !== "twitch" && platform !== "kick") || !code || !state) return res.redirect(`${dash}/dashboard?streamConnect=failed`);
  const r = await (await bot()).finishConnect(platform, code, state).catch((e: unknown) => ({ error: String(e), guildId: undefined, login: undefined }));
  const back = r.guildId ? `${dash}/dashboard/${r.guildId}/stream-growth` : `${dash}/dashboard`;
  const q = r.error ? `connectError=${encodeURIComponent(r.error)}` : `connected=${platform}`;
  res.redirect(`${back}?${q}`);
});

// ---- Kick's webhook: mounted before express.json() so the signature can be
// checked against the exact bytes Kick sent ----
export const kickWebhookRouter = Router();
kickWebhookRouter.post("/webhooks/kick", raw({ type: "*/*", limit: "1mb" }), async (req, res) => {
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  const messageId = req.header("Kick-Event-Message-Id") ?? "";
  const timestamp = req.header("Kick-Event-Message-Timestamp") ?? "";
  const signature = req.header("Kick-Event-Signature") ?? "";
  const type = req.header("Kick-Event-Type") ?? "";
  const m = await bot();
  if (!(await m.verifyKickSignature(messageId, timestamp, body, signature).catch(() => false))) return res.status(401).json({ error: "Bad signature" });
  res.status(200).json({ ok: true });
  let payload: unknown = null;
  try {
    payload = JSON.parse(body.toString("utf8"));
  } catch {
    return;
  }
  await m.handleKickEvent(type, messageId, payload).catch(() => null);
});

export default router;
