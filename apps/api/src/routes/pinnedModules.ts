import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

// Pinned sidebar links for the logged-in dashboard user on this server —
// keyed by their Discord user id, so the same pins follow them to any
// device they log into the dashboard from.
router.get("/guilds/:guildId/pinned-modules", requireAuth, requireGuildPermission, async (req: AuthedRequest, res) => {
  const rows = await prisma.pinnedModule.findMany({
    where: { guildId: req.params.guildId, userId: req.user!.id },
    select: { href: true },
  });
  res.json(rows.map((r) => r.href));
});

router.put("/guilds/:guildId/pinned-modules/:href", requireAuth, requireGuildPermission, async (req: AuthedRequest, res) => {
  const { guildId, href: encodedHref } = req.params;
  const href = decodeURIComponent(encodedHref);
  const userId = req.user!.id;
  const { pinned } = req.body as { pinned: boolean };

  if (pinned) {
    await prisma.pinnedModule.upsert({
      where: { guildId_userId_href: { guildId, userId, href } },
      create: { guildId, userId, href },
      update: {},
    });
  } else {
    await prisma.pinnedModule.deleteMany({ where: { guildId, userId, href } });
  }

  const rows = await prisma.pinnedModule.findMany({ where: { guildId, userId }, select: { href: true } });
  res.json(rows.map((r) => r.href));
});

export default router;
