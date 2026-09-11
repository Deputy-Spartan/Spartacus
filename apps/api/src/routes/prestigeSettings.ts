import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/prestige-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const row = await prisma.prestigeSettings.findUnique({ where: { guildId: req.params.guildId } });
  res.json({
    maxLevel: row?.maxLevel ?? 50,
    roleId: row?.roleId ?? null,
  });
});

router.put("/guilds/:guildId/prestige-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const { maxLevel, roleId } = req.body as {
    maxLevel?: number;
    roleId?: string | null;
  };

  const row = await prisma.prestigeSettings.upsert({
    where: { guildId: req.params.guildId },
    create: {
      guildId: req.params.guildId,
      maxLevel: maxLevel ?? 50,
      roleId: roleId ?? null,
    },
    update: {
      ...(maxLevel !== undefined ? { maxLevel } : {}),
      ...(roleId !== undefined ? { roleId } : {}),
    },
  });

  res.json(row);
});

export default router;
