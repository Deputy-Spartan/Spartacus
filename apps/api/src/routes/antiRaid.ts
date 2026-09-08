import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/anti-raid", requireAuth, requireGuildPermission, async (req, res) => {
  const config = await prisma.antiRaidConfig.findUnique({ where: { guildId: req.params.guildId } });
  res.json(
    config ?? {
      guildId: req.params.guildId,
      alertChannelId: null,
      joinRateLimit: 10,
      joinRateWindowSec: 30,
      minAccountAgeDays: 3,
      autoLockdown: false,
    }
  );
});

router.put("/guilds/:guildId/anti-raid", requireAuth, requireGuildPermission, async (req, res) => {
  const { alertChannelId, joinRateLimit, joinRateWindowSec, minAccountAgeDays, autoLockdown } = req.body;
  const config = await prisma.antiRaidConfig.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, alertChannelId, joinRateLimit, joinRateWindowSec, minAccountAgeDays, autoLockdown },
    update: { alertChannelId, joinRateLimit, joinRateWindowSec, minAccountAgeDays, autoLockdown },
  });
  res.json(config);
});

export default router;
