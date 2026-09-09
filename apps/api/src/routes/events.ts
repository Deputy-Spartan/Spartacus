import { Router } from "express";
import { Prisma, prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { deleteChannelMessage } from "../lib/discordRest";

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
  const filtered = input.filter((r): r is string => typeof r === "string" && VALID_ROLES.has(r));
  return filtered.length > 0 ? filtered : [];
}

router.get("/guilds/:guildId/events", requireAuth, requireGuildPermission, async (req, res) => {
  const events = await prisma.event.findMany({
    where: { guildId: req.params.guildId },
    include: { signups: true },
    orderBy: { startTime: "asc" },
  });
  res.json(events);
});

router.post("/guilds/:guildId/events", requireAuth, requireGuildPermission, async (req: any, res) => {
  const { guildId } = req.params;
  const { title, description, channelId, startTime, reminderMinutesBefore, embedEnabled, embedColor, buttons, enabledRoles } =
    req.body;

  const settings = await prisma.eventSettings.findUnique({ where: { guildId } });

  const event = await prisma.event.create({
    data: {
      guildId,
      title,
      description,
      channelId: channelId || settings?.defaultChannelId || undefined,
      startTime: new Date(startTime),
      reminderMinutesBefore: reminderMinutesBefore ?? settings?.defaultReminder ?? 15,
      embedEnabled: embedEnabled ?? true,
      embedColor: embedColor ?? "#00E5FF",
      buttons: sanitizeButtons(buttons),
      enabledRoles: sanitizeRoles(enabledRoles),
      createdById: req.user.id,
      needsSync: true, // the bot's eventSync job (runs every 15s) picks this up and posts it
    },
  });

  res.status(201).json(event);
});

router.put("/guilds/:guildId/events/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== req.params.guildId) {
    return res.status(404).json({ error: "Event not found" });
  }

  const { title, description, startTime, reminderMinutesBefore, embedEnabled, embedColor, buttons, enabledRoles } = req.body;

  const event = await prisma.event.update({
    where: { id: req.params.id },
    data: {
      title,
      description,
      startTime: startTime ? new Date(startTime) : undefined,
      reminderMinutesBefore,
      embedEnabled,
      embedColor,
      buttons: buttons !== undefined ? sanitizeButtons(buttons) : undefined,
      enabledRoles: enabledRoles !== undefined ? sanitizeRoles(enabledRoles) : undefined,
      needsSync: true, // re-sync the already-posted message with the new content
    },
  });

  res.json(event);
});

router.delete("/guilds/:guildId/events/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== req.params.guildId) {
    return res.status(404).json({ error: "Event not found" });
  }

  if (existing.messageId) {
    await deleteChannelMessage(existing.channelId, existing.messageId);
  }

  await prisma.event.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
