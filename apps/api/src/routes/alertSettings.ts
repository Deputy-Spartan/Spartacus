import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

const FIELDS = ["errorChannelId", "errorPingRoleId", "errorPingUserId", "deployChannelId", "uptimeChannelId", "botUpdatesChannelId"] as const;
type Field = (typeof FIELDS)[number];

router.get("/guilds/:guildId/alert-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const row = await prisma.alertSettings.findUnique({ where: { guildId: req.params.guildId } });
  res.json(Object.fromEntries(FIELDS.map((f) => [f, row?.[f] ?? null])));
});

// Partial update — the Errors page only ever sends the error*/deploy
// fields, the Status Channel page only ever sends uptimeChannelId/
// botUpdatesChannelId; whichever fields are omitted are left untouched.
router.put("/guilds/:guildId/alert-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const body = req.body as Partial<Record<Field, string | null>>;
  const patch: Partial<Record<Field, string | null>> = {};
  for (const f of FIELDS) {
    if (body[f] !== undefined) patch[f] = body[f];
  }

  const row = await prisma.alertSettings.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, ...patch },
    update: patch,
  });

  res.json(row);
});

export default router;
