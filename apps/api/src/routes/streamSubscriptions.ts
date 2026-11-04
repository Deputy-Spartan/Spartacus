import { Router } from "express";
import { Prisma, prisma } from "@spartacus/db";
import { LIVE_PLATFORMS, cleanHandle, type LivePlatform } from "@spartacus/shared";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { getBotClient } from "../lib/botClient";

const router = Router();
const PLATFORMS = new Set(LIVE_PLATFORMS.map((p) => p.id));
const id = (v: unknown) => (typeof v === "string" && /^\d{15,25}$/.test(v) ? v : null);
const text = (v: unknown, max = 2000) => (typeof v === "string" && v.trim() ? v.slice(0, max) : null);

// Which platforms the bot has keys for, so the page can say what's missing.
function keysReady() {
  return {
    TWITCH: !!(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET),
    KICK: !!(process.env.KICK_CLIENT_ID && process.env.KICK_CLIENT_SECRET),
  };
}

router.get("/guilds/:guildId/stream-subscriptions", requireAuth, requireGuildPermission, async (req, res) => {
  const subs = await prisma.streamSubscription.findMany({ where: { guildId: req.params.guildId }, orderBy: { id: "asc" } });
  res.json(subs);
});

router.get("/guilds/:guildId/stream-alert-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const s = await prisma.streamAlertSettings.findUnique({ where: { guildId: req.params.guildId } });
  res.json({
    settings: s ?? { guildId: req.params.guildId, showThumbnail: true, updateWhileLive: true, endAction: "EDIT", cooldownMinutes: 30 },
    keys: keysReady(),
  });
});

router.put("/guilds/:guildId/stream-alert-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const b = req.body ?? {};
  const data: Record<string, unknown> = {};
  for (const k of ["defaultChannelId", "pingRoleId", "liveRoleId", "selfServeRoleId"]) if (k in b) data[k] = id(b[k]);
  for (const k of ["contentTemplate", "embedTitle", "embedDescription", "buttonLabel", "buttonEmoji"]) if (k in b) data[k] = text(b[k], k === "buttonEmoji" ? 100 : 2000);
  if ("embedExtra" in b) data.embedExtra = b.embedExtra && typeof b.embedExtra === "object" ? (b.embedExtra as object) : Prisma.JsonNull;
  if ("embedColor" in b) data.embedColor = typeof b.embedColor === "string" && /^#[0-9a-f]{6}$/i.test(b.embedColor) ? b.embedColor : null;
  for (const k of ["showThumbnail", "updateWhileLive"]) if (typeof b[k] === "boolean") data[k] = b[k];
  if (["EDIT", "DELETE", "KEEP"].includes(b.endAction)) data.endAction = b.endAction;
  if (Number.isFinite(Number(b.cooldownMinutes))) data.cooldownMinutes = Math.max(0, Math.min(1440, Math.round(Number(b.cooldownMinutes))));
  const s = await prisma.streamAlertSettings.upsert({ where: { guildId: req.params.guildId }, create: { guildId: req.params.guildId, ...data }, update: data });
  res.json(s);
});

function streamerData(b: Record<string, unknown>, platform: LivePlatform) {
  const out: Record<string, unknown> = {};
  if ("displayName" in b) out.displayName = text(b.displayName, 80);
  if ("platformName" in b) out.platformName = platform === "other" ? text(b.platformName, 40) : null;
  if ("discordUserId" in b) out.discordUserId = id(b.discordUserId);
  if ("pingRoleId" in b) out.pingRoleId = id(b.pingRoleId);
  if ("announceChannelId" in b && id(b.announceChannelId)) out.announceChannelId = id(b.announceChannelId);
  return out;
}

router.post("/guilds/:guildId/stream-subscriptions", requireAuth, requireGuildPermission, async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const platform = String(b.platform) as LivePlatform;
  if (!PLATFORMS.has(platform)) return res.status(400).json({ error: "Pick a platform." });
  const handle = cleanHandle(platform, String(b.channelName ?? ""));
  if (!handle) return res.status(400).json({ error: "Type their channel name or link." });
  if (platform === "other" && !/^https?:\/\//i.test(handle)) return res.status(400).json({ error: "For Other, paste the full stream link." });
  const settings = await prisma.streamAlertSettings.findUnique({ where: { guildId: req.params.guildId } });
  const channel = id(b.announceChannelId) ?? settings?.defaultChannelId;
  if (!channel) return res.status(400).json({ error: "Pick the alert channel in step 1 first." });
  const dup = await prisma.streamSubscription.findFirst({ where: { guildId: req.params.guildId, platform, channelName: handle } });
  if (dup) return res.status(400).json({ error: "That streamer is already on the list." });
  const sub = await prisma.streamSubscription.create({
    data: { guildId: req.params.guildId, platform, channelName: handle, announceChannelId: channel, ...streamerData(b, platform) },
  });
  res.status(201).json(sub);
});

router.put("/guilds/:guildId/stream-subscriptions/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.streamSubscription.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== req.params.guildId) return res.status(404).json({ error: "Not found." });
  const sub = await prisma.streamSubscription.update({ where: { id: existing.id }, data: streamerData(req.body ?? {}, existing.platform as LivePlatform) });
  res.json(sub);
});

router.delete("/guilds/:guildId/stream-subscriptions/:id", requireAuth, requireGuildPermission, async (req, res) => {
  await prisma.streamSubscription.deleteMany({ where: { id: req.params.id, guildId: req.params.guildId } });
  res.status(204).send();
});

// Check a streamer right now, without waiting for the 2-minute check.
router.post("/guilds/:guildId/stream-subscriptions/:id/check", requireAuth, requireGuildPermission, async (req, res) => {
  const sub = await prisma.streamSubscription.findUnique({ where: { id: req.params.id } });
  if (!sub || sub.guildId !== req.params.guildId) return res.status(404).json({ error: "Not found." });
  const client = getBotClient();
  if (!client) return res.status(503).json({ error: "The bot isn't connected right now — try again in a moment." });
  const { checkStreamerNow } = await import("@spartacus/bot");
  res.json(await checkStreamerNow(client, sub.id));
});

// Post a sample alert for this streamer (never pings).
router.post("/guilds/:guildId/stream-subscriptions/:id/test", requireAuth, requireGuildPermission, async (req, res) => {
  const sub = await prisma.streamSubscription.findUnique({ where: { id: req.params.id } });
  if (!sub || sub.guildId !== req.params.guildId) return res.status(404).json({ error: "Not found." });
  const client = getBotClient();
  if (!client) return res.status(503).json({ error: "The bot isn't connected right now — try again in a moment." });
  const { sendTestAlert } = await import("@spartacus/bot");
  const r = await sendTestAlert(client, sub.id);
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json(r);
});

export default router;
