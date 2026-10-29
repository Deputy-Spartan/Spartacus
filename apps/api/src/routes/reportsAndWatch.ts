import { Router } from "express";
import { prisma } from "@spartacus/db";
import type { ReportStatus } from "@prisma/client";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { getBotClient } from "../lib/botClient";

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

// --- Player Reports Settings (review channel + staff role + report panel) ---
router.get("/guilds/:guildId/report-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const row = await prisma.playerReportSettings.findUnique({ where: { guildId: req.params.guildId } });
  res.json({
    reviewChannelId: row?.reviewChannelId ?? null,
    staffRoleId: row?.staffRoleId ?? null,
    panelChannelId: row?.panelChannelId ?? null,
    savedEmbedId: row?.savedEmbedId ?? null,
  });
});

router.put("/guilds/:guildId/report-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const { reviewChannelId, staffRoleId, panelChannelId, savedEmbedId } = req.body as {
    reviewChannelId?: string | null;
    staffRoleId?: string | null;
    panelChannelId?: string | null;
    savedEmbedId?: string | null;
  };

  const existing = await prisma.playerReportSettings.findUnique({ where: { guildId: req.params.guildId } });
  // Mirrors apps/api/src/routes/security.ts's verification route — any
  // change that affects what the panel looks like clears panelMessageId so
  // it gets redrawn/reposted instead of editing a now-stale message.
  const channelChanged = panelChannelId !== undefined && existing && existing.panelChannelId !== panelChannelId;
  const embedChanged = savedEmbedId !== undefined && existing && existing.savedEmbedId !== savedEmbedId;

  const row = await prisma.playerReportSettings.upsert({
    where: { guildId: req.params.guildId },
    create: {
      guildId: req.params.guildId,
      reviewChannelId: reviewChannelId ?? null,
      staffRoleId: staffRoleId ?? null,
      panelChannelId: panelChannelId ?? null,
      savedEmbedId: savedEmbedId ?? null,
    },
    update: {
      ...(reviewChannelId !== undefined ? { reviewChannelId } : {}),
      ...(staffRoleId !== undefined ? { staffRoleId } : {}),
      ...(panelChannelId !== undefined ? { panelChannelId } : {}),
      ...(savedEmbedId !== undefined ? { savedEmbedId } : {}),
      ...(channelChanged || embedChanged ? { panelMessageId: null } : {}),
    },
  });

  if ((channelChanged || embedChanged) && row.panelChannelId) {
    const client = getBotClient();
    if (client) {
      if (existing?.panelMessageId && existing.panelChannelId) {
        const oldChannel = await client.channels.fetch(existing.panelChannelId).catch(() => null);
        if (oldChannel?.isTextBased()) await oldChannel.messages.delete(existing.panelMessageId).catch(() => null);
      }
      const { postPlayerReportPanel } = await import("@spartacus/bot");
      await postPlayerReportPanel(client, row).catch(() => null);
    }
  }

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
