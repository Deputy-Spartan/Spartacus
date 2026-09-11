import { Router } from "express";
import { Prisma, prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { buildRestMessagePayload, deleteChannelMessage, postChannelMessage } from "../lib/discordRest";
import { buildMessagePayload } from "../lib/embedCreatorPayload";

const router = Router();

interface StickyButton {
  label: string;
  url: string;
}

function sanitizeButtons(input: unknown): Prisma.InputJsonValue {
  if (!Array.isArray(input)) return [];
  return input
    .filter((b): b is StickyButton => typeof b?.label === "string" && typeof b?.url === "string")
    .slice(0, 5) // Discord caps a single action row at 5 buttons
    .map((b) => ({ label: b.label.slice(0, 80), url: b.url }));
}

router.get("/guilds/:guildId/sticky-messages", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.stickyMessage.findMany({ where: { guildId: req.params.guildId } });
  res.json(rows);
});

router.post("/guilds/:guildId/sticky-messages", requireAuth, requireGuildPermission, async (req, res) => {
  const { channelId, content, embedEnabled, embedTitle, embedDescription, embedColor, buttons, embedExtra, savedEmbedId } = req.body;
  const data = {
    guildId: req.params.guildId,
    channelId,
    content,
    embedEnabled: Boolean(embedEnabled),
    embedTitle: embedTitle || null,
    embedDescription: embedDescription || null,
    embedColor: embedColor || null,
    buttons: sanitizeButtons(buttons),
    embedExtra: embedExtra ?? Prisma.JsonNull,
    savedEmbedId: savedEmbedId || null,
  };
  const row = await prisma.stickyMessage.upsert({
    where: { channelId },
    create: data,
    update: data,
  });
  res.status(201).json(row);
});

router.put("/guilds/:guildId/sticky-messages/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.stickyMessage.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== req.params.guildId) {
    return res.status(404).json({ error: "Sticky message not found" });
  }

  const { content, embedEnabled, embedTitle, embedDescription, embedColor, buttons, embedExtra, savedEmbedId } = req.body;
  const row = await prisma.stickyMessage.update({
    where: { id: req.params.id },
    data: {
      content,
      embedEnabled: Boolean(embedEnabled),
      embedTitle: embedTitle || null,
      embedDescription: embedDescription || null,
      embedColor: embedColor || null,
      buttons: sanitizeButtons(buttons),
      embedExtra: embedExtra ?? Prisma.JsonNull,
      savedEmbedId: savedEmbedId || null,
    },
  });
  res.json(row);
});

// Manually reposts the sticky right now — deletes the old message (if it
// still exists) and posts a fresh one, in case it got deleted some other
// way (manual delete, another bot's purge, etc.) and the channel has gone
// quiet since so the normal on-message repost hasn't fired.
router.post("/guilds/:guildId/sticky-messages/:id/resend", requireAuth, requireGuildPermission, async (req, res) => {
  const sticky = await prisma.stickyMessage.findUnique({ where: { id: req.params.id } });
  if (!sticky || sticky.guildId !== req.params.guildId) {
    return res.status(404).json({ error: "Sticky message not found" });
  }

  if (sticky.lastMessageId) {
    await deleteChannelMessage(sticky.channelId, sticky.lastMessageId);
  }

  let payload: Record<string, unknown>;
  if (sticky.savedEmbedId) {
    const preset = await prisma.embedCreatorPreset.findUnique({ where: { id: sticky.savedEmbedId } });
    payload = preset ? await buildMessagePayload(req.params.guildId, preset.data as Parameters<typeof buildMessagePayload>[1]) : {};
  } else {
    payload = buildRestMessagePayload({
      content: sticky.content,
      embedEnabled: sticky.embedEnabled,
      embedTitle: sticky.embedTitle ?? undefined,
      embedDescription: sticky.embedDescription ?? sticky.content,
      embedColor: sticky.embedColor ?? undefined,
      buttons: Array.isArray(sticky.buttons) ? (sticky.buttons as Array<{ label: string; url: string }>) : [],
      embedExtra: sticky.embedExtra,
    });
  }

  const result = await postChannelMessage(sticky.channelId, payload);
  if (result.error) return res.status(502).json({ error: result.error });

  if (result.id) await prisma.stickyMessage.update({ where: { id: sticky.id }, data: { lastMessageId: result.id } });

  res.json({ ok: true });
});

router.delete("/guilds/:guildId/sticky-messages/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.stickyMessage.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== req.params.guildId) {
    return res.status(404).json({ error: "Sticky message not found" });
  }

  await prisma.stickyMessage.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
