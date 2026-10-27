import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { getBotClient } from "../lib/botClient";

const router = Router();

router.get("/guilds/:guildId/weekly-recap-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const row = await prisma.weeklyRecapSettings.findUnique({ where: { guildId: req.params.guildId } });
  res.json({ channelId: row?.channelId ?? null });
});

router.put("/guilds/:guildId/weekly-recap-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const { channelId } = req.body as { channelId?: string | null };

  const row = await prisma.weeklyRecapSettings.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, channelId: channelId ?? null },
    update: { ...(channelId !== undefined ? { channelId } : {}) },
  });

  res.json(row);
});

router.post("/guilds/:guildId/weekly-recap-settings/send-test", requireAuth, requireGuildPermission, async (req, res) => {
  const settings = await prisma.weeklyRecapSettings.findUnique({ where: { guildId: req.params.guildId } });
  if (!settings) return res.status(400).json({ error: "Set a recap channel first." });

  const client = getBotClient();
  if (!client) return res.status(503).json({ error: "Bot isn't connected right now." });

  const { postWeeklyRecap } = await import("@spartacus/bot");
  const result = await postWeeklyRecap(client, settings, { isTest: true });
  if (!result.ok) return res.status(400).json({ error: result.error ?? "Failed to send test recap." });
  res.json({ ok: true });
});

export default router;
