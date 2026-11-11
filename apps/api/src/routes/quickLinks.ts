import { Router, type NextFunction, type Response } from "express";
import { prisma, Prisma } from "@spartacus/db";
import { DEFAULT_QUICK_LINKS, cleanQuickLinks, type QuickLinkGroup } from "@spartacus/shared";
import { requireAuth, isOwner, type AuthedRequest } from "../middleware/requireAuth";
import { getEffectiveBotStatus, isDashboardDeploying } from "../lib/botStatus";

// Owner Only → Quick Links. Account-wide (one list for the bot owner), so it
// lives on the BotConfig singleton rather than on any server.
const router = Router();

function ownerOnly(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!isOwner(req.user?.id ?? req.session?.id)) return res.status(403).json({ error: "Quick Links are for the bot owner only." });
  next();
}

async function readLinks(): Promise<QuickLinkGroup[]> {
  const cfg = await prisma.botConfig.findUnique({ where: { id: "singleton" }, select: { quickLinks: true } });
  return cleanQuickLinks(cfg?.quickLinks) ?? DEFAULT_QUICK_LINKS;
}

router.get("/owner/quick-links", requireAuth, ownerOnly, async (_req: AuthedRequest, res) => {
  const [groups, status] = await Promise.all([readLinks(), getEffectiveBotStatus().catch(() => null)]);
  res.json({
    groups,
    status: status && {
      bot: status.phase,
      botMessage: status.message,
      lastHeartbeatAt: status.lastHeartbeatAt,
      dashboardDeploying: isDashboardDeploying(status.dashboardDeployingSince),
    },
  });
});

router.put("/owner/quick-links", requireAuth, ownerOnly, async (req: AuthedRequest, res) => {
  const groups = cleanQuickLinks(req.body?.groups);
  if (!groups) return res.status(400).json({ error: "One of the links isn't a valid web address (it must start with https://)." });
  const quickLinks = groups as unknown as Prisma.InputJsonValue;
  await prisma.botConfig.upsert({ where: { id: "singleton" }, create: { id: "singleton", quickLinks }, update: { quickLinks } });
  res.json({ groups });
});

// Back to the starting set.
router.delete("/owner/quick-links", requireAuth, ownerOnly, async (_req: AuthedRequest, res) => {
  await prisma.botConfig.updateMany({ where: { id: "singleton" }, data: { quickLinks: Prisma.DbNull } });
  res.json({ groups: DEFAULT_QUICK_LINKS });
});

export default router;
