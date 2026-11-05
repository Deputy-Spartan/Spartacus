import { Router, type NextFunction, type Response } from "express";
import { prisma, Prisma } from "@spartacus/db";
import { FRONT_PAGE_DEFAULTS, cleanFrontPage, type FrontPageCard } from "@spartacus/shared";
import { requireAuth, isOwner, type AuthedRequest } from "../middleware/requireAuth";

// Owner Only → Front Page: the info boxes on the sign-in page. Account-wide,
// so it lives on the BotConfig singleton like Quick Links.
const router = Router();

function ownerOnly(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!isOwner(req.user?.id ?? req.session?.id)) return res.status(403).json({ error: "The front page is for the bot owner only." });
  next();
}

let cached: { at: number; cards: FrontPageCard[] } | null = null;

async function readCards(): Promise<FrontPageCard[]> {
  const cfg = await prisma.botConfig.findUnique({ where: { id: "singleton" }, select: { frontPage: true } });
  return cleanFrontPage(cfg?.frontPage) ?? FRONT_PAGE_DEFAULTS;
}

// Public: the sign-in page reads this. Cached briefly; a save clears it.
router.get("/public/front-page", async (_req, res) => {
  if (!cached || Date.now() - cached.at > 60_000) cached = { at: Date.now(), cards: await readCards() };
  res.set("Cache-Control", "public, max-age=30").json({ cards: cached.cards });
});

router.get("/owner/front-page", requireAuth, ownerOnly, async (_req: AuthedRequest, res) => {
  const cfg = await prisma.botConfig.findUnique({ where: { id: "singleton" }, select: { frontPage: true } });
  const saved = cleanFrontPage(cfg?.frontPage);
  res.json({ cards: saved ?? FRONT_PAGE_DEFAULTS, custom: !!saved });
});

router.put("/owner/front-page", requireAuth, ownerOnly, async (req: AuthedRequest, res) => {
  const cards = cleanFrontPage(req.body?.cards);
  if (!cards) return res.status(400).json({ error: "Keep at least 2 boxes, each with a title." });
  const frontPage = cards as unknown as Prisma.InputJsonValue;
  await prisma.botConfig.upsert({ where: { id: "singleton" }, create: { id: "singleton", frontPage }, update: { frontPage } });
  cached = null;
  res.json({ cards, custom: true });
});

// Back to the original boxes.
router.delete("/owner/front-page", requireAuth, ownerOnly, async (_req: AuthedRequest, res) => {
  await prisma.botConfig.updateMany({ where: { id: "singleton" }, data: { frontPage: Prisma.DbNull } });
  cached = null;
  res.json({ cards: FRONT_PAGE_DEFAULTS, custom: false });
});

export default router;
