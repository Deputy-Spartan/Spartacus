import { Router } from "express";
import { prisma } from "@spartacus/db";
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

// --- Player Reports Settings (report category + staff role + report panel) ---
router.get("/guilds/:guildId/report-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const row = await prisma.playerReportSettings.findUnique({ where: { guildId: req.params.guildId } });
  res.json({
    staffRoleId: row?.staffRoleId ?? null,
    categoryId: row?.categoryId ?? null,
    channelNameFormat: row?.channelNameFormat ?? "report-{number}",
    panelChannelId: row?.panelChannelId ?? null,
    savedEmbedId: row?.savedEmbedId ?? null,
    dmCreateEnabled: row?.dmCreateEnabled ?? true,
    dmCreateMessage: row?.dmCreateMessage ?? null,
    dmClaimEnabled: row?.dmClaimEnabled ?? true,
    dmClaimMessage: row?.dmClaimMessage ?? null,
    dmCloseEnabled: row?.dmCloseEnabled ?? true,
    dmCloseMessage: row?.dmCloseMessage ?? null,
  });
});

router.put("/guilds/:guildId/report-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const {
    staffRoleId,
    categoryId,
    channelNameFormat,
    panelChannelId,
    savedEmbedId,
    dmCreateEnabled,
    dmCreateMessage,
    dmClaimEnabled,
    dmClaimMessage,
    dmCloseEnabled,
    dmCloseMessage,
  } = req.body as {
    staffRoleId?: string | null;
    categoryId?: string | null;
    channelNameFormat?: string;
    panelChannelId?: string | null;
    savedEmbedId?: string | null;
    dmCreateEnabled?: boolean;
    dmCreateMessage?: string | null;
    dmClaimEnabled?: boolean;
    dmClaimMessage?: string | null;
    dmCloseEnabled?: boolean;
    dmCloseMessage?: string | null;
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
      staffRoleId: staffRoleId ?? null,
      categoryId: categoryId ?? null,
      channelNameFormat: channelNameFormat ?? "report-{number}",
      panelChannelId: panelChannelId ?? null,
      savedEmbedId: savedEmbedId ?? null,
      ...(dmCreateEnabled !== undefined ? { dmCreateEnabled } : {}),
      ...(dmCreateMessage !== undefined ? { dmCreateMessage } : {}),
      ...(dmClaimEnabled !== undefined ? { dmClaimEnabled } : {}),
      ...(dmClaimMessage !== undefined ? { dmClaimMessage } : {}),
      ...(dmCloseEnabled !== undefined ? { dmCloseEnabled } : {}),
      ...(dmCloseMessage !== undefined ? { dmCloseMessage } : {}),
    },
    update: {
      ...(staffRoleId !== undefined ? { staffRoleId } : {}),
      ...(categoryId !== undefined ? { categoryId } : {}),
      ...(channelNameFormat !== undefined ? { channelNameFormat } : {}),
      ...(panelChannelId !== undefined ? { panelChannelId } : {}),
      ...(savedEmbedId !== undefined ? { savedEmbedId } : {}),
      ...(channelChanged || embedChanged ? { panelMessageId: null } : {}),
      ...(dmCreateEnabled !== undefined ? { dmCreateEnabled } : {}),
      ...(dmCreateMessage !== undefined ? { dmCreateMessage } : {}),
      ...(dmClaimEnabled !== undefined ? { dmClaimEnabled } : {}),
      ...(dmClaimMessage !== undefined ? { dmClaimMessage } : {}),
      ...(dmCloseEnabled !== undefined ? { dmCloseEnabled } : {}),
      ...(dmCloseMessage !== undefined ? { dmCloseMessage } : {}),
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
