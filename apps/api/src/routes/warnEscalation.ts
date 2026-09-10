import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/warn-escalation", requireAuth, requireGuildPermission, async (req, res) => {
  const row = await prisma.warnEscalationSettings.findUnique({ where: { guildId: req.params.guildId } });
  res.json({
    warnThreshold: row?.warnThreshold ?? 3,
    warnWindowDays: row?.warnWindowDays ?? 30,
    action: row?.action ?? "TIMEOUT",
    timeoutMinutes: row?.timeoutMinutes ?? 60,
  });
});

router.put("/guilds/:guildId/warn-escalation", requireAuth, requireGuildPermission, async (req, res) => {
  const { warnThreshold, warnWindowDays, action, timeoutMinutes } = req.body as {
    warnThreshold?: number;
    warnWindowDays?: number;
    action?: string;
    timeoutMinutes?: number;
  };

  const row = await prisma.warnEscalationSettings.upsert({
    where: { guildId: req.params.guildId },
    create: {
      guildId: req.params.guildId,
      warnThreshold: warnThreshold ?? 3,
      warnWindowDays: warnWindowDays ?? 30,
      action: action ?? "TIMEOUT",
      timeoutMinutes: timeoutMinutes ?? 60,
    },
    update: {
      ...(warnThreshold !== undefined ? { warnThreshold } : {}),
      ...(warnWindowDays !== undefined ? { warnWindowDays } : {}),
      ...(action !== undefined ? { action } : {}),
      ...(timeoutMinutes !== undefined ? { timeoutMinutes } : {}),
    },
  });

  res.json(row);
});

export default router;
