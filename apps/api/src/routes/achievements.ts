import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

const TRIGGER_TYPES = new Set(["LEVEL", "VOICE_HOURS", "DAILY_STREAK"]);

router.get("/guilds/:guildId/achievements", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.achievement.findMany({
    where: { guildId: req.params.guildId },
    orderBy: { awardedAt: "desc" },
    take: 50,
  });
  res.json(rows);
});

// Where achievement announcements post — without this, the bot posts in
// whatever channel the triggering action happened in.
router.get("/guilds/:guildId/achievement-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const row = await prisma.achievementSettings.findUnique({ where: { guildId: req.params.guildId } });
  res.json(row ?? { guildId: req.params.guildId, channelId: null });
});

router.patch("/guilds/:guildId/achievement-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const { channelId } = req.body as { channelId?: string | null };
  const row = await prisma.achievementSettings.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, channelId: channelId || null },
    update: { channelId: channelId !== undefined ? channelId || null : undefined },
  });
  res.json(row);
});

// Server-defined achievements riding the same built-in triggers (level
// reached, hours in voice, daily-claim streak) at whatever threshold the
// admin picks — e.g. Level 5, or 100 hours in voice.
router.get("/guilds/:guildId/custom-achievements", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.customAchievement.findMany({ where: { guildId: req.params.guildId }, orderBy: [{ triggerType: "asc" }, { threshold: "asc" }] });
  res.json(rows);
});

router.post("/guilds/:guildId/custom-achievements", requireAuth, requireGuildPermission, async (req, res) => {
  const { name, emoji, triggerType, threshold } = req.body as { name?: string; emoji?: string; triggerType?: string; threshold?: number };
  if (!name?.trim()) return res.status(400).json({ error: "Enter a name for this achievement." });
  if (!triggerType || !TRIGGER_TYPES.has(triggerType)) return res.status(400).json({ error: "Pick a valid trigger type." });
  if (!Number.isFinite(threshold) || (threshold as number) <= 0) return res.status(400).json({ error: "Threshold must be a positive number." });

  const row = await prisma.customAchievement.create({
    data: { guildId: req.params.guildId, name: name.trim(), emoji: emoji?.trim() || "🏆", triggerType, threshold: Math.floor(threshold as number) },
  });
  res.status(201).json(row);
});

router.delete("/guilds/:guildId/custom-achievements/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.customAchievement.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== req.params.guildId) {
    return res.status(404).json({ error: "Achievement not found" });
  }
  await prisma.customAchievement.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
