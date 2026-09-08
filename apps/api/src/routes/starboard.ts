import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/starboard", requireAuth, requireGuildPermission, async (req, res) => {
  const config = await prisma.starboardConfig.findUnique({ where: { guildId: req.params.guildId } });
  res.json(config ?? { guildId: req.params.guildId, channelId: null, threshold: 5 });
});

router.put("/guilds/:guildId/starboard", requireAuth, requireGuildPermission, async (req, res) => {
  const { channelId, threshold } = req.body;
  const config = await prisma.starboardConfig.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, channelId, threshold },
    update: { channelId, threshold },
  });
  res.json(config);
});

export default router;
