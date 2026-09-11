import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/rules-gate-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const row = await prisma.rulesGateSettings.findUnique({ where: { guildId: req.params.guildId } });
  res.json({
    channelId: row?.channelId ?? null,
    roleId: row?.roleId ?? null,
  });
});

router.put("/guilds/:guildId/rules-gate-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const { channelId, roleId } = req.body as { channelId?: string | null; roleId?: string | null };

  const existing = await prisma.rulesGateSettings.findUnique({ where: { guildId: req.params.guildId } });
  // If the channel changed, clear messageId so the poster job redraws the
  // panel in the new channel instead of trying to edit a message that's now
  // in the wrong place — mirrors apps/api/src/routes/statusChannels.ts.
  const channelChanged = channelId !== undefined && existing && existing.channelId !== channelId;

  const row = await prisma.rulesGateSettings.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, channelId: channelId ?? null, roleId: roleId ?? null },
    update: {
      ...(channelId !== undefined ? { channelId } : {}),
      ...(roleId !== undefined ? { roleId } : {}),
      ...(channelChanged ? { messageId: null } : {}),
    },
  });

  res.json(row);
});

export default router;
