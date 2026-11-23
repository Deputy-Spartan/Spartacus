import { randomBytes, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { prisma } from "@spartacus/db";
import { CHAT_COMMANDS_KEY, CHAT_COMMANDS_STATE_KEY, cleanChatCommands, cleanChatCommandsState, type ChatCommandsConfig } from "@spartacus/shared";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { getBotClient } from "../lib/botClient";

// Streaming › Chat Commands: the dashboard page, plus run links so Lumia
// Stream, Streamer.bot or anything that can open a web link can run a command.

const router = Router();
const bot = () => import("@spartacus/bot");
const noBot = { error: "The bot isn't connected right now. Try again in a moment." };
const newKey = () => randomBytes(18).toString("base64url");

async function getRow(guildId: string, key: string) {
  return (await prisma.streamDeckState.findUnique({ where: { guildId_key: { guildId, key } } }))?.value;
}
async function putRow(guildId: string, key: string, value: object) {
  await prisma.streamDeckState.upsert({ where: { guildId_key: { guildId, key } }, create: { guildId, key, value }, update: { value } });
}
async function loadConfig(guildId: string): Promise<ChatCommandsConfig> {
  const raw = await getRow(guildId, CHAT_COMMANDS_KEY);
  const cfg = cleanChatCommands(raw);
  // Every server gets its own run-link key the first time.
  if (!cfg.runKey) {
    cfg.runKey = newKey();
    await putRow(guildId, CHAT_COMMANDS_KEY, cfg);
  }
  return cfg;
}
const forget = async (guildId: string) => (await bot().catch(() => null))?.forgetChatCommands(guildId);

router.get("/guilds/:guildId/chat-commands", requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const [config, state, accounts, overlay] = await Promise.all([
    loadConfig(guildId),
    getRow(guildId, CHAT_COMMANDS_STATE_KEY),
    prisma.streamerAccount.findMany({ where: { guildId }, orderBy: { createdAt: "asc" } }),
    prisma.streamDeckState.count({ where: { guildId, key: "tool:cmdfx" } }),
  ]);
  const b = await bot().catch(() => null);
  res.json({
    config,
    state: cleanChatCommandsState(state),
    accounts: accounts.map((a) => ({ id: a.id, platform: a.platform, login: a.login, displayName: a.displayName, canChat: b ? b.streamAccountCanChat(a) : false })),
    overlayOpened: overlay > 0,
  });
});

router.put("/guilds/:guildId/chat-commands", requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const before = await loadConfig(guildId);
  const next = cleanChatCommands({ ...((req.body ?? {}) as object), runKey: before.runKey });
  await putRow(guildId, CHAT_COMMANDS_KEY, next);
  await forget(guildId);
  res.json({ config: next });
});

// Change the counts (like !death) or the quotes list.
router.put("/guilds/:guildId/chat-commands/state", requireAuth, requireGuildPermission, async (req, res) => {
  const st = cleanChatCommandsState(req.body);
  await putRow(req.params.guildId, CHAT_COMMANDS_STATE_KEY, st);
  res.json({ state: st });
});

router.post("/guilds/:guildId/chat-commands/new-key", requireAuth, requireGuildPermission, async (req, res) => {
  const cfg = await loadConfig(req.params.guildId);
  cfg.runKey = newKey();
  await putRow(req.params.guildId, CHAT_COMMANDS_KEY, cfg);
  await forget(req.params.guildId);
  res.json({ config: cfg });
});

// The Test button: runs it for real (it replies in chat when you're connected).
router.post("/guilds/:guildId/chat-commands/run", requireAuth, requireGuildPermission, async (req, res) => {
  if (!getBotClient()) return res.status(503).json(noBot);
  const name = String(req.body?.name ?? "").trim().slice(0, 30);
  const args = String(req.body?.args ?? "").trim().slice(0, 200);
  if (!name) return res.status(400).json({ error: "Pick a command." });
  const r = await (await bot()).runChatCommandFrom(req.params.guildId, name, "Dashboard", undefined, args);
  res.status(r.ok ? 200 : 400).json(r.ok ? r : { error: r.message });
});

// ---- Your own sound files (picked from your computer) ----
// Kept in the database (one row each, up to SOUND_MAX per server) and played
// by the Command alerts overlay from /public/chat-sound/<server>/<id>.
const SOUND_MAX = 30;
const SOUND_BYTES = 1024 * 1024;
const soundUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: SOUND_BYTES },
  fileFilter: (_req, file, cb) => cb(null, /^audio\//.test(file.mimetype)),
});
router.post("/guilds/:guildId/chat-commands/sound", requireAuth, requireGuildPermission, (req, res, next) => {
  soundUpload.single("file")(req, res, (err: unknown) => {
    if (err) return res.status(400).json({ error: (err as { code?: string }).code === "LIMIT_FILE_SIZE" ? "That sound is too big. Keep it under 1 MB (a few seconds of mp3)." : "Couldn't read that file." });
    next();
  });
}, async (req, res) => {
  const guildId = req.params.guildId;
  if (!req.file) return res.status(400).json({ error: "Pick a sound file (mp3, wav or ogg)." });
  // Full: make room by removing the oldest sound no command uses.
  const rows = await prisma.streamDeckState.findMany({ where: { guildId, key: { startsWith: "chatsound:" } }, select: { key: true, id: true }, orderBy: { id: "asc" } }).catch(() => [] as Array<{ key: string; id: string }>);
  if (rows.length >= SOUND_MAX) {
    const cfg = cleanChatCommands(await getRow(guildId, CHAT_COMMANDS_KEY));
    const used = new Set(cfg.cmds.map((c) => c.soundUrl.split("/").pop()));
    const spare = rows.filter((r) => !used.has(r.key.slice(10)))[0]; // oldest first (ids grow over time)
    if (!spare) return res.status(400).json({ error: `You have ${SOUND_MAX} sounds in use. Remove one from a command first.` });
    await prisma.streamDeckState.delete({ where: { guildId_key: { guildId, key: spare.key } } }).catch(() => null);
  }
  const id = randomBytes(9).toString("base64url");
  const name = (req.file.originalname || "sound").replace(/[^\w .()-]/g, "").slice(0, 60) || "sound";
  await putRow(guildId, `chatsound:${id}`, { type: req.file.mimetype, name, data: req.file.buffer.toString("base64") });
  const base = (await bot().catch(() => null))?.apiBase() ?? `${req.protocol}://${req.get("host")}`;
  res.status(201).json({ url: `${base}/public/chat-sound/${guildId}/${id}`, name });
});

router.get("/public/chat-sound/:guildId/:id", async (req, res) => {
  const { guildId, id } = req.params;
  if (!/^\d{5,25}$/.test(guildId) || !/^[\w-]{6,20}$/.test(id)) return res.status(404).end();
  const v = (await getRow(guildId, `chatsound:${id}`)) as { type?: string; data?: string } | undefined;
  if (!v?.data) return res.status(404).end();
  res.set({ "Content-Type": /^audio\/[\w.+-]+$/.test(v.type ?? "") ? v.type! : "audio/mpeg", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" });
  res.send(Buffer.from(v.data, "base64"));
});

// ---- Run links: /public/chat-command/<server>/<command>?key=… ----
const lastRun = new Map<string, number>();
async function runLink(req: import("express").Request, res: import("express").Response) {
  const { guildId, name } = req.params;
  if (!/^\d{5,25}$/.test(guildId) || !/^[\p{L}\p{N}_-]{1,30}$/u.test(name)) return res.status(404).json({ error: "Not found" });
  const key = String(req.query.key ?? req.get("x-spartacus-key") ?? "");
  const cfg = cleanChatCommands(await getRow(guildId, CHAT_COMMANDS_KEY));
  const a = Buffer.from(key), b = Buffer.from(cfg.runKey || "-");
  if (!cfg.runKey || a.length !== b.length || !timingSafeEqual(a, b)) return res.status(403).json({ error: "That link's key is wrong. Copy it again from the Chat Commands page." });
  // At most 4 a second per server.
  const now = Date.now();
  if (now - (lastRun.get(guildId) ?? 0) < 250) return res.status(429).json({ error: "Slow down." });
  lastRun.set(guildId, now);
  if (!getBotClient()) return res.status(503).json(noBot);
  const from = String(req.query.from ?? "Run link").replace(/[^\w .-]/g, "").slice(0, 20) || "Run link";
  const args = String(req.query.args ?? (req.body as Record<string, unknown> | undefined)?.args ?? "").slice(0, 200);
  const platform = req.query.platform === "twitch" || req.query.platform === "kick" ? req.query.platform : undefined;
  const r = await (await bot()).runChatCommandFrom(guildId, name, from, platform, args);
  res.status(r.ok ? 200 : 400).json(r);
}
router.get("/public/chat-command/:guildId/:name", runLink);
router.post("/public/chat-command/:guildId/:name", runLink);

export default router;
