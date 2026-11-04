import { Router, type NextFunction, type Request, type Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@spartacus/db";
import { requireAuth, isOwner, type AuthedRequest } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { getBotClient } from "../lib/botClient";

const router = Router();
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

// ---- Dashboard (Owner Only): make, list and cancel connection keys ----
function ownerOnly(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!isOwner(req.user?.id ?? req.session?.id)) return res.status(403).json({ error: "The Stream Deck page is for the bot owner only." });
  next();
}

router.get("/guilds/:guildId/stream-deck/keys", requireAuth, requireGuildPermission, ownerOnly, async (req: AuthedRequest, res) => {
  const keys = await prisma.streamDeckKey.findMany({ where: { guildId: req.params.guildId, revokedAt: null }, orderBy: { createdAt: "desc" } });
  res.json(keys.map(({ hash, ...k }) => k));
});

router.post("/guilds/:guildId/stream-deck/keys", requireAuth, requireGuildPermission, ownerOnly, async (req: AuthedRequest, res) => {
  const name = typeof req.body?.name === "string" && req.body.name.trim() ? req.body.name.trim().slice(0, 60) : "My Stream Deck";
  const count = await prisma.streamDeckKey.count({ where: { guildId: req.params.guildId, revokedAt: null } });
  if (count >= 10) return res.status(400).json({ error: "You can have up to 10 keys per server. Cancel one first." });
  const key = `sd_live_${randomBytes(24).toString("base64url")}`;
  const row = await prisma.streamDeckKey.create({
    data: { guildId: req.params.guildId, userId: req.session?.id ?? req.user!.id, name, prefix: key.slice(0, 12), hash: sha(key) },
  });
  // The only time the full key is ever sent.
  res.status(201).json({ id: row.id, name: row.name, prefix: row.prefix, createdAt: row.createdAt, key });
});

router.delete("/guilds/:guildId/stream-deck/keys/:id", requireAuth, requireGuildPermission, ownerOnly, async (req: AuthedRequest, res) => {
  await prisma.streamDeckKey.updateMany({ where: { id: req.params.id, guildId: req.params.guildId, revokedAt: null }, data: { revokedAt: new Date() } });
  res.status(204).send();
});

router.get("/guilds/:guildId/stream-deck/log", requireAuth, requireGuildPermission, ownerOnly, async (req: AuthedRequest, res) => {
  const rows = await prisma.streamDeckLog.findMany({ where: { guildId: req.params.guildId }, orderBy: { createdAt: "desc" }, take: 100 });
  res.json(rows);
});

// ---- The plugin: everything below needs "Authorization: Bearer sd_live_…" ----
interface SdRequest extends Request {
  sd?: { keyId: string; guildId: string; userId: string };
}
const lastUsed = new Map<string, number>();
const presses = new Map<string, number[]>();

async function sdAuth(req: SdRequest, res: Response, next: NextFunction) {
  const raw = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!raw.startsWith("sd_live_")) return res.status(401).json({ error: "Paste your Stream Deck key from the dashboard into the plugin." });
  const key = await prisma.streamDeckKey.findUnique({ where: { hash: sha(raw) } });
  if (!key || key.revokedAt) return res.status(401).json({ error: "That key was cancelled or doesn't exist. Make a new one on the dashboard." });
  if (!isOwner(key.userId)) return res.status(403).json({ error: "Stream Deck keys only work for the bot owner." });
  req.sd = { keyId: key.id, guildId: key.guildId, userId: key.userId };
  // Note the last use at most once a minute.
  if (Date.now() - (lastUsed.get(key.id) ?? 0) > 60_000) {
    lastUsed.set(key.id, Date.now());
    void prisma.streamDeckKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => null);
  }
  next();
}

async function guildFor(req: SdRequest, res: Response) {
  const client = getBotClient();
  if (!client) {
    res.status(503).json({ error: "Spartacus is restarting. Try again in a moment." });
    return null;
  }
  const guild = client.guilds.cache.get(req.sd!.guildId) ?? (await client.guilds.fetch(req.sd!.guildId).catch(() => null));
  if (!guild) {
    res.status(404).json({ error: "Spartacus isn't in that server anymore." });
    return null;
  }
  const bot = await import("@spartacus/bot");
  return { guild, bot, actor: { guild, userId: req.sd!.userId, keyId: req.sd!.keyId } };
}

router.get("/sd/v1/me", sdAuth, async (req: SdRequest, res) => {
  const ctx = await guildFor(req, res);
  if (!ctx) return;
  res.json({ guild: { id: ctx.guild.id, name: ctx.guild.name, icon: ctx.guild.iconURL({ size: 64 }) }, userId: req.sd!.userId });
});

router.get("/sd/v1/options", sdAuth, async (req: SdRequest, res) => {
  const ctx = await guildFor(req, res);
  if (!ctx) return;
  res.json(await ctx.bot.streamDeckOptions(ctx.guild));
});

router.post("/sd/v1/faces", sdAuth, async (req: SdRequest, res) => {
  const ctx = await guildFor(req, res);
  if (!ctx) return;
  const items = Array.isArray(req.body?.items) ? (req.body.items as Array<{ id: string; action: string; settings?: Record<string, unknown> }>).slice(0, 64) : [];
  const faces: Record<string, unknown> = {};
  await Promise.all(
    items.map(async (it) => {
      faces[it.id] = await ctx.bot.streamDeckFace(ctx.actor, String(it.action), (it.settings ?? {}) as never).catch((e: unknown) => ({ title: String(it.action), line: "Error", tone: "red", error: e instanceof Error ? e.message : String(e) }));
    }),
  );
  res.json({ faces });
});

router.post("/sd/v1/run", sdAuth, async (req: SdRequest, res) => {
  const ctx = await guildFor(req, res);
  if (!ctx) return;
  // 30 presses a minute per key, so a stuck key can't spam Discord.
  const now = Date.now();
  const recent = (presses.get(req.sd!.keyId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 30) return res.status(429).json({ ok: false, message: "Slow down: 30 presses a minute." });
  presses.set(req.sd!.keyId, [...recent, now]);
  const { action, settings, op, value } = req.body ?? {};
  const result = await ctx.bot
    .runStreamDeck(ctx.actor, String(action), (settings ?? {}) as never, op === "turn" || op === "tap" ? op : "press", Number.isFinite(Number(value)) ? Number(value) : undefined)
    .catch((e: unknown) => ({ ok: false, message: e instanceof Error ? e.message : "That didn't work." }));
  if (result.message || op === "press" || !op) {
    void prisma.streamDeckLog
      .create({ data: { guildId: ctx.guild.id, keyId: req.sd!.keyId, action: String(action), ok: result.ok, message: (result.message || "Done").slice(0, 300) } })
      .catch(() => null);
  }
  res.json(result);
});

export default router;
