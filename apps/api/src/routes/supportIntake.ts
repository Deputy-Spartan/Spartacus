import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

// ---- Flows (the DM category buttons) ----

router.get("/guilds/:guildId/support-flows", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.supportFlow.findMany({
    where: { guildId: req.params.guildId },
    orderBy: { sortOrder: "asc" },
    include: { questions: { orderBy: { sortOrder: "asc" } } },
  });
  res.json(rows);
});

router.post("/guilds/:guildId/support-flows", requireAuth, requireGuildPermission, async (req, res) => {
  const { label, color, categoryId, roleId } = req.body;
  const count = await prisma.supportFlow.count({ where: { guildId: req.params.guildId } });
  const row = await prisma.supportFlow.create({
    data: {
      guildId: req.params.guildId,
      label: label || "New Category",
      color: color ?? "#5865F2",
      categoryId: categoryId ?? null,
      roleId: roleId ?? null,
      sortOrder: count,
    },
    include: { questions: true },
  });
  res.status(201).json(row);
});

router.patch("/guilds/:guildId/support-flows/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const fields = ["label", "color", "categoryId", "roleId", "enabled", "sortOrder"];
  const data: Record<string, unknown> = {};
  for (const f of fields) if (req.body[f] !== undefined) data[f] = req.body[f];
  const row = await prisma.supportFlow.update({ where: { id: req.params.id }, data, include: { questions: { orderBy: { sortOrder: "asc" } } } });
  res.json(row);
});

router.delete("/guilds/:guildId/support-flows/:id", requireAuth, requireGuildPermission, async (req, res) => {
  await prisma.supportFlow.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// ---- Questions (the per-flow question chain) ----

router.post("/guilds/:guildId/support-flows/:flowId/questions", requireAuth, requireGuildPermission, async (req, res) => {
  const { prompt, mode, choices } = req.body;
  const count = await prisma.supportQuestion.count({ where: { flowId: req.params.flowId } });
  const row = await prisma.supportQuestion.create({
    data: {
      flowId: req.params.flowId,
      prompt: prompt || "New question",
      mode: mode === "CHOICE" ? "CHOICE" : "TEXT",
      choices: Array.isArray(choices) ? choices : [],
      sortOrder: count,
    },
  });
  res.status(201).json(row);
});

router.patch("/guilds/:guildId/support-flows/:flowId/questions/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const fields = ["prompt", "mode", "choices", "sortOrder"];
  const data: Record<string, unknown> = {};
  for (const f of fields) if (req.body[f] !== undefined) data[f] = req.body[f];
  const row = await prisma.supportQuestion.update({ where: { id: req.params.id }, data });
  res.json(row);
});

router.delete("/guilds/:guildId/support-flows/:flowId/questions/:id", requireAuth, requireGuildPermission, async (req, res) => {
  await prisma.supportQuestion.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// Bulk reorder — the dashboard sends the full ordered id list after a drag.
router.put("/guilds/:guildId/support-flows/:flowId/questions/order", requireAuth, requireGuildPermission, async (req, res) => {
  const ids: string[] = Array.isArray(req.body.ids) ? req.body.ids : [];
  await prisma.$transaction(ids.map((id, i) => prisma.supportQuestion.update({ where: { id }, data: { sortOrder: i } })));
  res.status(204).send();
});

// ---- Tickets (admin visibility) ----

router.get("/guilds/:guildId/support-tickets", requireAuth, requireGuildPermission, async (req, res) => {
  const status = req.query.status as string | undefined;
  const rows = await prisma.supportTicket.findMany({
    where: {
      guildId: req.params.guildId,
      ...(status ? { status: status as "DRAFT" | "OPEN" | "CLAIMED" | "CLOSED" } : { status: { not: "DRAFT" } }),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { flow: { select: { label: true } } },
  });
  res.json(rows);
});

export default router;
