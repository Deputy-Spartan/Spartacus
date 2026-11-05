import { Router } from "express";
import { prisma } from "@spartacus/db";
import { DEFAULT_PROFILE_STATS, cleanProfileStats } from "@spartacus/shared";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { getBotClient } from "../lib/botClient";

const router = Router();

router.get("/guilds/:guildId/profile-cards", requireAuth, requireGuildPermission, async (req, res) => {
  const s = await prisma.profileCardSettings.findUnique({ where: { guildId: req.params.guildId } });
  res.json({ stats: s ? cleanProfileStats(s.stats) : DEFAULT_PROFILE_STATS, allowBios: s?.allowBios ?? true });
});

router.put("/guilds/:guildId/profile-cards", requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const stats = cleanProfileStats(req.body?.stats);
  const allowBios = req.body?.allowBios !== false;
  const s = await prisma.profileCardSettings.upsert({ where: { guildId }, create: { guildId, stats, allowBios }, update: { stats, allowBios } });
  res.json({ stats: cleanProfileStats(s.stats), allowBios: s.allowBios });
});

// The signed-in person's own card in this server, as /profile would draw it.
router.get("/guilds/:guildId/profile-cards/preview", requireAuth, requireGuildPermission, async (req: AuthedRequest, res) => {
  const client = getBotClient();
  const guild = client?.guilds.cache.get(req.params.guildId);
  const userId = req.user?.id ?? req.session?.id;
  if (!guild || !userId) return res.status(503).json({ error: "The bot isn't connected to this server right now." });
  try {
    const { renderProfile } = await import("@spartacus/bot");
    const png = await renderProfile(guild, userId);
    res.set("Content-Type", "image/png").set("Cache-Control", "no-store").send(png);
  } catch (err) {
    res.status(500).json({ error: "Couldn't draw the card: " + (err instanceof Error ? err.message : "unknown error") });
  }
});

export default router;
