import { Router } from "express";
import { Prisma, prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

const VALID_ROLES = new Set(["TANK", "DPS", "HEALER", "ATTENDING", "ABSENT"]);

function sanitizeButtons(input: unknown): Prisma.InputJsonValue {
  if (!Array.isArray(input)) return [];
  return input
    .filter((b): b is { label: string; url: string } => typeof b?.label === "string" && typeof b?.url === "string")
    .slice(0, 5)
    .map((b) => ({ label: b.label.slice(0, 80), url: b.url }));
}

function sanitizeRoles(input: unknown): Prisma.InputJsonValue {
  if (!Array.isArray(input)) return ["TANK", "DPS", "HEALER", "ATTENDING", "ABSENT"];
  return input.filter((r): r is string => typeof r === "string" && VALID_ROLES.has(r));
}

router.get("/guilds/:guildId/event-templates", requireAuth, requireGuildPermission, async (req, res) => {
  const templates = await prisma.eventTemplate.findMany({ where: { guildId: req.params.guildId }, orderBy: { name: "asc" } });
  res.json(templates);
});

router.post("/guilds/:guildId/event-templates", requireAuth, requireGuildPermission, async (req, res) => {
  const { name, title, description, reminderMinutesBefore, embedEnabled, embedColor, buttons, enabledRoles, embedExtra } = req.body;
  const embedExtraValue = (embedExtra ?? Prisma.JsonNull) as Prisma.InputJsonValue;

  const template = await prisma.eventTemplate.upsert({
    where: { guildId_name: { guildId: req.params.guildId, name } },
    create: {
      guildId: req.params.guildId,
      name,
      title,
      description,
      reminderMinutesBefore: reminderMinutesBefore ?? 15,
      embedEnabled: embedEnabled ?? true,
      embedColor: embedColor ?? "#00E5FF",
      buttons: sanitizeButtons(buttons),
      enabledRoles: sanitizeRoles(enabledRoles),
      embedExtra: embedExtraValue,
    },
    update: {
      title,
      description,
      reminderMinutesBefore: reminderMinutesBefore ?? 15,
      embedEnabled: embedEnabled ?? true,
      embedColor: embedColor ?? "#00E5FF",
      buttons: sanitizeButtons(buttons),
      enabledRoles: sanitizeRoles(enabledRoles),
      embedExtra: embedExtraValue,
    },
  });
  res.status(201).json(template);
});

router.delete("/guilds/:guildId/event-templates/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.eventTemplate.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== req.params.guildId) {
    return res.status(404).json({ error: "Template not found" });
  }
  await prisma.eventTemplate.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
