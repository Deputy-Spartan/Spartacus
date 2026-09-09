import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

// Backed by requireGuildPermission's own logging hook — every mutating
// dashboard request against this guild lands a row there, so this route is
// purely read-only.
router.get("/guilds/:guildId/activity", requireAuth, requireGuildPermission, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const rows = await prisma.dashboardAuditEntry.findMany({
    where: { guildId: req.params.guildId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  res.json(rows);
});

export default router;
