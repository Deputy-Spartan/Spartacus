import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/voice-activity", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.voiceActivity.findMany({
    where: { guildId: req.params.guildId },
    orderBy: { totalMinutes: "desc" },
    take: 50,
  });
  res.json(rows);
});

export default router;
