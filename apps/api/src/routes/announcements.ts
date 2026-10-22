import { Router } from "express";
import { Prisma, prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { getBotClient } from "../lib/botClient";

const router = Router();

router.get("/guilds/:guildId/announcements", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.announcement.findMany({ where: { guildId: req.params.guildId }, orderBy: { createdAt: "desc" } });
  res.json(rows);
});

router.post("/guilds/:guildId/announcements", requireAuth, requireGuildPermission, async (req, res) => {
  const { channelId, content, embedEnabled, embedTitle, embedColor, buttons, scheduledFor, embedExtra, savedEmbedId } = req.body;
  const row = await prisma.announcement.create({
    data: {
      guildId: req.params.guildId,
      channelId,
      content,
      embedEnabled: Boolean(embedEnabled),
      embedTitle,
      embedColor,
      buttons: buttons ?? [],
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
      embedExtra: embedExtra ?? Prisma.JsonNull,
      savedEmbedId: savedEmbedId ?? null,
    },
  });
  res.status(201).json(row);
});

// Only a queued (unsent) announcement can be edited — including clearing
// or changing its schedule. Once it's published there's a real Discord
// message out there; editing this row afterward couldn't do anything to
// it, so that's rejected rather than silently updating a row nobody will
// ever see reflected anywhere.
router.patch("/guilds/:guildId/announcements/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.announcement.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== req.params.guildId) return res.status(404).json({ error: "Not found" });
  if (existing.sentAt) return res.status(400).json({ error: "This announcement already published and can't be edited. Use Resend instead." });

  const { channelId, content, embedEnabled, embedTitle, embedColor, buttons, scheduledFor, embedExtra, savedEmbedId } = req.body;
  const row = await prisma.announcement.update({
    where: { id: req.params.id },
    data: {
      channelId,
      content,
      embedEnabled: Boolean(embedEnabled),
      embedTitle,
      embedColor,
      buttons: buttons ?? [],
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
      embedExtra: embedExtra ?? Prisma.JsonNull,
      savedEmbedId: savedEmbedId ?? null,
    },
  });
  res.json(row);
});

// Sends a queued announcement right now, through the bot's own live client
// (apps/bot's publishAnnouncement) rather than a separate raw REST call —
// same reasoning as the sticky-message "Resend Now" fix: going through the
// bot avoids a second, unguarded code path for something that sends a
// message. A scheduled announcement reaches Discord the same way, just
// triggered by the bot's own cron tick instead of this button.
router.post("/guilds/:guildId/announcements/:id/publish", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.announcement.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== req.params.guildId) return res.status(404).json({ error: "Not found" });

  const client = getBotClient();
  if (!client) return res.status(503).json({ error: "The bot isn't connected right now — try again in a moment." });

  const { publishAnnouncement } = await import("@spartacus/bot");
  const result = await publishAnnouncement(client, existing.id);
  if (!result.ok) return res.status(502).json({ error: result.error ?? "Failed to publish this announcement" });

  res.json({ ok: true });
});

router.delete("/guilds/:guildId/announcements/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.announcement.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== req.params.guildId) return res.status(404).json({ error: "Not found" });
  await prisma.announcement.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
