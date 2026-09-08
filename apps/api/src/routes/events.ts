import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

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
  const { title, description, channelId, startTime, reminderMinutesBefore } = req.body;

  const event = await prisma.event.create({
    data: {
      guildId,
      title,
      description,
      channelId,
      startTime: new Date(startTime),
      reminderMinutesBefore: reminderMinutesBefore ?? 15,
      createdById: req.user.id,
    },
  });

  // The bot process picks this row up on its next poll (jobs/eventReminder.ts
  // also handles posting the initial signup embed) — see apps/bot for the
  // consumer side of this write.
  res.status(201).json(event);
});

export default router;
