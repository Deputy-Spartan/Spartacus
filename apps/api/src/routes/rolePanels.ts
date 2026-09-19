import { Router } from "express";
import { Prisma, prisma } from "@spartacus/db";
import { resolveEmojiInput } from "../lib/discordRest";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

async function resolveOptionEmojis(guildId: string, options: unknown): Promise<{ options?: unknown; error?: string }> {
  if (!Array.isArray(options)) return { options };
  const out = [];
  for (const o of options as Array<{ emoji?: string }>) {
    if (!o.emoji) { out.push(o); continue; }
    const r = await resolveEmojiInput(guildId, o.emoji);
    if (r.error) return { error: r.error };
    out.push({ ...o, emoji: r.emoji });
  }
  return { options: out };
}

router.get("/guilds/:guildId/role-panels", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.rolePanel.findMany({ where: { guildId: req.params.guildId } });
  res.json(rows);
});

router.post("/guilds/:guildId/role-panels", requireAuth, requireGuildPermission, async (req, res) => {
  const { name, channelId, description, layout, options, embedEnabled, embedColor, embedExtra, savedEmbedId, notifyMode } = req.body;
  const resolved = await resolveOptionEmojis(req.params.guildId, options);
  if (resolved.error) return res.status(400).json({ error: resolved.error });
  const row = await prisma.rolePanel.create({
    data: {
      guildId: req.params.guildId,
      name,
      channelId,
      description,
      layout: layout ?? "BUTTONS",
      options: (resolved.options ?? []) as Prisma.InputJsonValue,
      embedEnabled: Boolean(embedEnabled),
      embedColor: embedColor ?? undefined,
      embedExtra: embedExtra ?? Prisma.JsonNull,
      savedEmbedId: savedEmbedId ?? null,
      notifyMode: ["PRIVATE", "DM", "NONE"].includes(notifyMode) ? notifyMode : "PRIVATE",
    },
  });
  res.status(201).json(row);
});

router.patch("/guilds/:guildId/role-panels/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const { name, description, layout, options, embedEnabled, embedColor, embedExtra, savedEmbedId, notifyMode } = req.body;
  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (description !== undefined) data.description = description;
  if (layout !== undefined) data.layout = layout;
  if (options !== undefined) {
    const resolved = await resolveOptionEmojis(req.params.guildId, options);
    if (resolved.error) return res.status(400).json({ error: resolved.error });
    data.options = resolved.options;
  }
  if (embedEnabled !== undefined) data.embedEnabled = Boolean(embedEnabled);
  if (embedColor !== undefined) data.embedColor = embedColor;
  if (embedExtra !== undefined) data.embedExtra = embedExtra ?? Prisma.JsonNull;
  if (savedEmbedId !== undefined) data.savedEmbedId = savedEmbedId;
  if (["PRIVATE", "DM", "NONE"].includes(notifyMode)) data.notifyMode = notifyMode;
  // Editing content invalidates the posted message so the poster job redraws it.
  if (Object.keys(data).length > 0) data.messageId = null;
  const row = await prisma.rolePanel.update({ where: { id: req.params.id }, data });
  res.json(row);
});

router.delete("/guilds/:guildId/role-panels/:id", requireAuth, requireGuildPermission, async (req, res) => {
  await prisma.rolePanel.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
