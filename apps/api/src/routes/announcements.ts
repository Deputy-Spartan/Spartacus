import { Router } from "express";
import { Prisma, prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { buildRestMessagePayload, editChannelMessage } from "../lib/discordRest";
import { buildMessagePayload } from "../lib/embedCreatorPayload";

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

// Editing an announcement that hasn't sent yet just updates the queued row —
// the poster job (apps/bot/src/jobs/announcementPoster.ts) will pick up the
// new content when it's due. One that already sent gets its live Discord
// message edited in place via REST instead, using whichever messageId the
// poster job recorded when it originally sent it.
router.patch("/guilds/:guildId/announcements/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.announcement.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== req.params.guildId) return res.status(404).json({ error: "Not found" });

  const { channelId, content, embedEnabled, embedTitle, embedColor, buttons, scheduledFor, embedExtra, savedEmbedId } = req.body;
  const data: Prisma.AnnouncementUpdateInput = {
    channelId,
    content,
    embedEnabled: Boolean(embedEnabled),
    embedTitle,
    embedColor,
    buttons: buttons ?? [],
    scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
    embedExtra: embedExtra ?? Prisma.JsonNull,
    savedEmbedId: savedEmbedId ?? null,
  };

  const row = await prisma.announcement.update({ where: { id: req.params.id }, data });

  if (existing.sentAt && existing.messageId) {
    const payload = row.savedEmbedId
      ? await buildMessagePayload(req.params.guildId, (await prisma.embedCreatorPreset.findUnique({ where: { id: row.savedEmbedId } }))?.data as Parameters<
          typeof buildMessagePayload
        >[1])
      : buildRestMessagePayload({
          content: row.content ?? "",
          embedEnabled: row.embedEnabled,
          embedTitle: row.embedTitle ?? undefined,
          embedDescription: row.content ?? undefined,
          embedColor: row.embedColor ?? undefined,
          buttons: Array.isArray(row.buttons) ? (row.buttons as Array<{ label: string; url: string }>) : [],
          embedExtra: row.embedExtra,
        });

    const result = await editChannelMessage(existing.channelId, existing.messageId, payload);
    if (result.error) return res.status(502).json({ error: `Saved, but couldn't update the live message: ${result.error}` });
  }

  res.json(row);
});

router.delete("/guilds/:guildId/announcements/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.announcement.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== req.params.guildId) return res.status(404).json({ error: "Not found" });
  await prisma.announcement.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
