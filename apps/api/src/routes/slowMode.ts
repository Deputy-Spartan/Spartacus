import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { getGuildChannels, setChannelSlowmode } from "../lib/discordRest";

const router = Router();

// No dedicated table — Discord's channel object is the source of truth for
// the current rate limit, so this just reads/writes it directly.
router.get("/guilds/:guildId/slow-mode", requireAuth, requireGuildPermission, async (req, res) => {
  const channels = await getGuildChannels(req.params.guildId);
  const textChannels = channels
    .filter((c) => c.type === 0 || c.type === 5)
    .map((c) => ({ id: c.id, name: c.name, rateLimitPerUser: c.rate_limit_per_user ?? 0 }));
  res.json(textChannels);
});

router.put("/guilds/:guildId/slow-mode/:channelId", requireAuth, requireGuildPermission, async (req, res) => {
  const seconds = Math.max(0, Math.min(21600, Number(req.body.seconds) || 0)); // Discord's own cap is 6 hours
  const result = await setChannelSlowmode(req.params.channelId, seconds);
  if (result.error) return res.status(502).json({ error: result.error });
  res.json({ channelId: req.params.channelId, rateLimitPerUser: seconds });
});

export default router;
