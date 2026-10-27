import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission, requireGuildOwner } from "../middleware/requireGuildPermission";
import { getBotClient } from "../lib/botClient";

const router = Router();

// --- Verification ---
router.get("/guilds/:guildId/verification", requireAuth, requireGuildPermission, async (req, res) => {
  const config = await prisma.verificationConfig.findUnique({ where: { guildId: req.params.guildId } });
  res.json(
    config ?? {
      guildId: req.params.guildId,
      verifiedRoleId: null,
      minAccountAgeDays: 0,
      panelChannelId: null,
      savedEmbedId: null,
    }
  );
});

router.put("/guilds/:guildId/verification", requireAuth, requireGuildPermission, async (req, res) => {
  const { verifiedRoleId, minAccountAgeDays, panelChannelId, savedEmbedId } = req.body as {
    verifiedRoleId?: string | null;
    minAccountAgeDays?: number;
    panelChannelId?: string | null;
    savedEmbedId?: string | null;
  };

  const existing = await prisma.verificationConfig.findUnique({ where: { guildId: req.params.guildId } });
  // Mirrors apps/api/src/routes/rulesGateSettings.ts — any change that
  // affects what the panel looks like clears panelMessageId so it gets
  // redrawn/reposted instead of editing a now-stale message.
  const channelChanged = panelChannelId !== undefined && existing && existing.panelChannelId !== panelChannelId;
  const embedChanged = savedEmbedId !== undefined && existing && existing.savedEmbedId !== savedEmbedId;

  const config = await prisma.verificationConfig.upsert({
    where: { guildId: req.params.guildId },
    create: {
      guildId: req.params.guildId,
      verifiedRoleId,
      minAccountAgeDays,
      panelChannelId: panelChannelId ?? null,
      savedEmbedId: savedEmbedId ?? null,
    },
    update: {
      verifiedRoleId,
      minAccountAgeDays,
      ...(panelChannelId !== undefined ? { panelChannelId } : {}),
      ...(savedEmbedId !== undefined ? { savedEmbedId } : {}),
      ...(channelChanged || embedChanged ? { panelMessageId: null } : {}),
    },
  });

  if ((channelChanged || embedChanged) && config.panelChannelId) {
    const client = getBotClient();
    if (client) {
      if (existing?.panelMessageId && existing.panelChannelId) {
        const oldChannel = await client.channels.fetch(existing.panelChannelId).catch(() => null);
        if (oldChannel?.isTextBased()) await oldChannel.messages.delete(existing.panelMessageId).catch(() => null);
      }
      const { postVerificationPanel } = await import("@spartacus/bot");
      await postVerificationPanel(client, config).catch(() => null);
    }
  }

  res.json(config);
});

// --- Anti-Nuke ---
router.get("/guilds/:guildId/anti-nuke", requireAuth, requireGuildPermission, async (req, res) => {
  const config = await prisma.antiNukeConfig.findUnique({ where: { guildId: req.params.guildId } });
  res.json(
    config ?? {
      guildId: req.params.guildId,
      alertChannelId: null,
      maxBansPerMinute: 3,
      maxChannelDeletesPerMinute: 3,
      stripRolesOnTrigger: true,
    }
  );
});

router.put("/guilds/:guildId/anti-nuke", requireAuth, requireGuildPermission, async (req, res) => {
  const { alertChannelId, maxBansPerMinute, maxChannelDeletesPerMinute, stripRolesOnTrigger } = req.body;
  const config = await prisma.antiNukeConfig.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, alertChannelId, maxBansPerMinute, maxChannelDeletesPerMinute, stripRolesOnTrigger },
    update: { alertChannelId, maxBansPerMinute, maxChannelDeletesPerMinute, stripRolesOnTrigger },
  });
  res.json(config);
});

// --- Honeypot ---
router.get("/guilds/:guildId/honeypot", requireAuth, requireGuildPermission, async (req, res) => {
  const config = await prisma.honeypotConfig.findUnique({ where: { guildId: req.params.guildId } });
  res.json(config ?? { guildId: req.params.guildId, channelId: null });
});

router.put("/guilds/:guildId/honeypot", requireAuth, requireGuildPermission, async (req, res) => {
  const { channelId } = req.body;
  const config = await prisma.honeypotConfig.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, channelId },
    update: { channelId },
  });
  res.json(config);
});

// --- Moderation Cases (read history) ---
router.get("/guilds/:guildId/cases", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.moderationCase.findMany({
    where: { guildId: req.params.guildId },
    orderBy: { caseNumber: "desc" },
    take: 100,
  });
  res.json(rows);
});

// Server-owner-only — moderation history is evidence; letting any
// Manage-Server mod erase it would let them cover their own tracks.
router.delete(
  "/guilds/:guildId/cases/:caseNumber",
  requireAuth,
  requireGuildPermission,
  requireGuildOwner,
  async (req, res) => {
    const caseNumber = Number(req.params.caseNumber);
    if (!Number.isInteger(caseNumber)) return res.status(400).json({ error: "Invalid case number" });

    const existing = await prisma.moderationCase.findUnique({
      where: { guildId_caseNumber: { guildId: req.params.guildId, caseNumber } },
    });
    if (!existing) return res.status(404).json({ error: "Case not found" });

    await prisma.moderationCase.delete({ where: { id: existing.id } });
    res.status(204).send();
  }
);

// --- Quarantine (read active records) ---
router.get("/guilds/:guildId/quarantine", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.quarantineRecord.findMany({
    where: { guildId: req.params.guildId, active: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(rows);
});

export default router;
