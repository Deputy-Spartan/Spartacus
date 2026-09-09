import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { getBotGuildIds } from "../lib/discordRest";

const router = Router();

// GET /guilds — servers the logged-in user can manage (used by the
// dashboard's server selector). Already filtered to manageable guilds and
// captured into the session at OAuth callback time (routes/auth.ts). Each
// row is annotated with whether the bot itself is actually in that server.
router.get("/guilds", requireAuth, async (req: any, res) => {
  const guilds = req.session?.guilds ?? [];
  const botGuildIds = await getBotGuildIds().catch(() => new Set<string>());
  res.json(guilds.map((g: { id: string }) => ({ ...g, botInstalled: botGuildIds.has(g.id) })));
});

export default router;
