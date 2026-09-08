import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

// --- Verification ---
router.get("/guilds/:guildId/verification", requireAuth, requireGuildPermission, async (req, res) => {
  const config = await prisma.verificationConfig.findUnique({ where: { guildId: req.params.guildId } });
  res.json(config ?? { guildId: req.params.guildId, verifiedRoleId: null, minAccountAgeDays: 0 });
});

router.put("/guilds/:guildId/verification", requireAuth, requireGuildPermission, async (req, res) => {
  const { verifiedRoleId, minAccountAgeDays } = req.body;
  const config = await prisma.verificationConfig.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, verifiedRoleId, minAccountAgeDays },
    update: { verifiedRoleId, minAccountAgeDays },
  });
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

// --- Quarantine (read active records) ---
router.get("/guilds/:guildId/quarantine", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.quarantineRecord.findMany({
    where: { guildId: req.params.guildId, active: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(rows);
});

export default router;
