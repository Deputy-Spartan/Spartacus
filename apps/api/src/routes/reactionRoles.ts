import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/reaction-roles", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.reactionRole.findMany({ where: { guildId: req.params.guildId } });
  res.json(rows);
});

// Creating a reaction role here only writes the mapping — the bot process
// (apps/bot/src/modules/community/reactionRoles.ts) is the one that actually
// adds the seed reaction to the target message on its next sync pass.
router.post("/guilds/:guildId/reaction-roles", requireAuth, requireGuildPermission, async (req, res) => {
  const { channelId, messageId, emoji, roleId } = req.body;
  const row = await prisma.reactionRole.create({
    data: { guildId: req.params.guildId, channelId, messageId, emoji, roleId },
  });
  res.status(201).json(row);
});

router.delete("/guilds/:guildId/reaction-roles/:id", requireAuth, requireGuildPermission, async (req, res) => {
  await prisma.reactionRole.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
