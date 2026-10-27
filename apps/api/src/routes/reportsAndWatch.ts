import { Router } from "express";
import { prisma } from "@spartacus/db";
import type { ReportStatus } from "@prisma/client";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

// --- Player Reports ---
router.get("/guilds/:guildId/reports", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.playerReport.findMany({
    where: { guildId: req.params.guildId },
    orderBy: { createdAt: "desc" },
  });
  res.json(rows);
});

router.patch("/guilds/:guildId/reports/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const { status } = req.body as { status: ReportStatus };
  const data: { status: ReportStatus; closedAt?: Date } = { status };
  if (status === "RESOLVED") data.closedAt = new Date();
  const row = await prisma.playerReport.update({ where: { id: req.params.id }, data });
  res.json(row);
});

// --- Player Reports Settings (review channel + staff role) ---
router.get("/guilds/:guildId/report-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const row = await prisma.playerReportSettings.findUnique({ where: { guildId: req.params.guildId } });
  res.json({ reviewChannelId: row?.reviewChannelId ?? null, staffRoleId: row?.staffRoleId ?? null });
});

router.put("/guilds/:guildId/report-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const { reviewChannelId, staffRoleId } = req.body as { reviewChannelId?: string | null; staffRoleId?: string | null };
  const row = await prisma.playerReportSettings.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, reviewChannelId: reviewChannelId ?? null, staffRoleId: staffRoleId ?? null },
    update: { ...(reviewChannelId !== undefined ? { reviewChannelId } : {}), ...(staffRoleId !== undefined ? { staffRoleId } : {}) },
  });
  res.json(row);
});

// --- Perm Watch ---
router.get("/guilds/:guildId/perm-watch", requireAuth, requireGuildPermission, async (req, res) => {
  const config = await prisma.permWatchConfig.findUnique({ where: { guildId: req.params.guildId } });
  res.json(config ?? { guildId: req.params.guildId, alertChannelId: null });
});

router.put("/guilds/:guildId/perm-watch", requireAuth, requireGuildPermission, async (req, res) => {
  const { alertChannelId } = req.body;
  const config = await prisma.permWatchConfig.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, alertChannelId },
    update: { alertChannelId },
  });
  res.json(config);
});

export default router;
