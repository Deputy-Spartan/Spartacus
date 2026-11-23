import { randomBytes, timingSafeEqual } from "node:crypto";
import { Router } from "express";
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
