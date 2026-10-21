import { Router } from "express";
import { Prisma, prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { getBotClient } from "../lib/botClient";

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

// Manually reposts the sticky right now — same delete-old/post-new logic
// the bot runs automatically, just triggered on demand. Goes through the
// bot's own gateway client (apps/bot's forceStickyRepost) rather than a
// separate Discord REST call, so this can't race with — and double-post
// against — the bot's own duplicate-post guards.
router.post("/guilds/:guildId/sticky-messages/:id/resend", requireAuth, requireGuildPermission, async (req, res) => {
  const sticky = await prisma.stickyMessage.findUnique({ where: { id: req.params.id } });
  if (!sticky || sticky.guildId !== req.params.guildId) {
    return res.status(404).json({ error: "Sticky message not found" });
  }

  const client = getBotClient();
  if (!client) {
    return res.status(503).json({ error: "The bot isn't connected right now — try again in a moment." });
  }

  const { forceStickyRepost } = await import("@spartacus/bot");
  const result = await forceStickyRepost(client, sticky.id);
  if (!result.ok) return res.status(502).json({ error: result.error ?? "Failed to resend sticky message" });

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
