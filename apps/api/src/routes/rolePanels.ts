import { Router } from "express";
import { Prisma, prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/role-panels", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.rolePanel.findMany({ where: { guildId: req.params.guildId } });
  res.json(rows);
});

router.post("/guilds/:guildId/role-panels", requireAuth, requireGuildPermission, async (req, res) => {
  const { name, channelId, description, layout, options, embedEnabled, embedColor, embedExtra } = req.body;
  const row = await prisma.rolePanel.create({
    data: {
      guildId: req.params.guildId,
      name,
      channelId,
      description,
      layout: layout ?? "BUTTONS",
      options: options ?? [],
      embedEnabled: Boolean(embedEnabled),
      embedColor: embedColor ?? undefined,
      embedExtra: embedExtra ?? Prisma.JsonNull,
    },
  });
  res.status(201).json(row);
});

router.patch("/guilds/:guildId/role-panels/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const { name, description, layout, options, embedEnabled, embedColor, embedExtra } = req.body;
  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (description !== undefined) data.description = description;
  if (layout !== undefined) data.layout = layout;
  if (options !== undefined) data.options = options;
  if (embedEnabled !== undefined) data.embedEnabled = Boolean(embedEnabled);
  if (embedColor !== undefined) data.embedColor = embedColor;
  if (embedExtra !== undefined) data.embedExtra = embedExtra ?? Prisma.JsonNull;
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
