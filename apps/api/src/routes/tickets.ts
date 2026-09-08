import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/ticket-panels", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.ticketPanel.findMany({ where: { guildId: req.params.guildId } });
  res.json(rows);
});

// The bot posts the actual button panel message and writes messageId back
// once live (see apps/bot/src/modules/tickets/panels.ts) — the dashboard
// only defines where it should go.
router.post("/guilds/:guildId/ticket-panels", requireAuth, requireGuildPermission, async (req, res) => {
  const { name, channelId, categoryId, buttonLabel, supportRoleId } = req.body;
  const row = await prisma.ticketPanel.create({
    data: { guildId: req.params.guildId, name, channelId, categoryId, buttonLabel, supportRoleId },
  });
  res.status(201).json(row);
});

router.delete("/guilds/:guildId/ticket-panels/:id", requireAuth, requireGuildPermission, async (req, res) => {
  await prisma.ticketPanel.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

router.get("/guilds/:guildId/tickets", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.ticket.findMany({
    where: { guildId: req.params.guildId, status: { not: "CLOSED" } },
    orderBy: { createdAt: "desc" },
  });
  res.json(rows);
});

export default router;
