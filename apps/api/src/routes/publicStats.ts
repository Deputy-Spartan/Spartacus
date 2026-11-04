import { Router } from "express";
import { getBotClient } from "../lib/botClient";

const router = Router();

// Public, for the login page: how many servers Spartacus is in, plus its
// name and avatar. Cached for a minute so it's cheap to hit.
let cached: { at: number; body: { servers: number; members: number; botName: string | null; botAvatar: string | null } } | null = null;

router.get("/public/stats", (_req, res) => {
  if (!cached || Date.now() - cached.at > 60_000) {
    const client = getBotClient();
    const guilds = client ? [...client.guilds.cache.values()] : [];
    cached = {
      at: Date.now(),
      body: {
        servers: guilds.length,
        members: guilds.reduce((n, g) => n + (g.memberCount || 0), 0),
        botName: client?.user?.username ?? null,
        botAvatar: client?.user?.displayAvatarURL({ size: 128 }) ?? null,
      },
    };
  }
  res.set("Cache-Control", "public, max-age=60").json(cached.body);
});

export default router;
