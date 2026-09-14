import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

// ---- Panels ----

router.get("/guilds/:guildId/application-panels", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.applicationPanel.findMany({ where: { guildId: req.params.guildId } });
  res.json(rows);
});

router.post("/guilds/:guildId/application-panels", requireAuth, requireGuildPermission, async (req, res) => {
  const { name, channelId, description, layout, typeIds } = req.body;
  const row = await prisma.applicationPanel.create({
    data: { guildId: req.params.guildId, name, channelId, description, layout: layout ?? "BUTTONS", typeIds: typeIds ?? [] },
  });
  res.status(201).json(row);
});

router.patch("/guilds/:guildId/application-panels/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const { name, description, layout, typeIds, paused } = req.body;
  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (description !== undefined) data.description = description;
  if (layout !== undefined) data.layout = layout;
  if (typeIds !== undefined) data.typeIds = typeIds;
  if (paused !== undefined) data.paused = paused;
  if (Object.keys(data).length > 0) data.messageId = null; // invalidate the posted message so the poster job redraws it
  const row = await prisma.applicationPanel.update({ where: { id: req.params.id }, data });
  res.json(row);
});

router.delete("/guilds/:guildId/application-panels/:id", requireAuth, requireGuildPermission, async (req, res) => {
  await prisma.applicationPanel.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// ---- Types ----

router.get("/guilds/:guildId/application-types", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.applicationType.findMany({ where: { guildId: req.params.guildId }, orderBy: { createdAt: "asc" } });
  res.json(rows);
});

router.post("/guilds/:guildId/application-types", requireAuth, requireGuildPermission, async (req, res) => {
  const { name, emoji, description, reviewChannelId, staffRoleIds, questions, introMessage, submittedMessage, acceptMessage, denyMessage, customResponses } =
    req.body;
  const row = await prisma.applicationType.create({
    data: {
      guildId: req.params.guildId,
      name,
      emoji,
      description,
      reviewChannelId,
      staffRoleIds: staffRoleIds ?? [],
      questions: questions ?? [],
      introMessage,
      submittedMessage,
      acceptMessage,
      denyMessage,
      customResponses: customResponses ?? [],
    },
  });
  res.status(201).json(row);
});

router.patch("/guilds/:guildId/application-types/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const fields = [
    "name",
    "emoji",
    "description",
    "reviewChannelId",
    "staffRoleIds",
    "questions",
    "introMessage",
    "submittedMessage",
    "acceptMessage",
    "denyMessage",
    "customResponses",
    "enabled",
  ];
  const data: Record<string, unknown> = {};
  for (const f of fields) if (req.body[f] !== undefined) data[f] = req.body[f];
  const row = await prisma.applicationType.update({ where: { id: req.params.id }, data });
  res.json(row);
});

router.delete("/guilds/:guildId/application-types/:id", requireAuth, requireGuildPermission, async (req, res) => {
  await prisma.applicationType.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// ---- Applications (submissions) ----

router.get("/guilds/:guildId/applications", requireAuth, requireGuildPermission, async (req, res) => {
  const status = req.query.status as string | undefined;
  const rows = await prisma.application.findMany({
    where: { guildId: req.params.guildId, ...(status ? { status: status as "PENDING" | "ACCEPTED" | "DENIED" } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json(rows);
});

router.get("/guilds/:guildId/applications/counts", requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const [pending, accepted, denied] = await Promise.all([
    prisma.application.count({ where: { guildId, status: "PENDING" } }),
    prisma.application.count({ where: { guildId, status: "ACCEPTED" } }),
    prisma.application.count({ where: { guildId, status: "DENIED" } }),
  ]);
  res.json({ pending, accepted, denied });
});

// ---- Settings ----

const DEFAULT_SETTINGS = {
  logChannelId: null as string | null,
  supportRoleIds: [] as string[],
};

router.get("/guilds/:guildId/application-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const config = await prisma.applicationSettings.findUnique({ where: { guildId: req.params.guildId } });
  res.json(config ?? { guildId: req.params.guildId, ...DEFAULT_SETTINGS });
});

router.put("/guilds/:guildId/application-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const { logChannelId, supportRoleIds } = req.body;
  const data = { logChannelId, supportRoleIds: supportRoleIds ?? [] };
  const row = await prisma.applicationSettings.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, ...DEFAULT_SETTINGS, ...data },
    update: data,
  });
  res.json(row);
});

export default router;
