import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth, isOwner, type AuthedRequest } from "../middleware/requireAuth";

const router = Router();

function requireOwner(req: AuthedRequest, res: import("express").Response): boolean {
  if (!isOwner(req.user?.id)) {
    res.status(403).json({ error: "Only the bot owner can manage the changelog." });
    return false;
  }
  return true;
}

// Global — not scoped to one guild. Every dashboard user with access sees
// the same feed, so an entry the owner posts reaches every server at once.
router.get("/changelog", requireAuth, async (req, res) => {
  const rows = await prisma.changelogEntry.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  res.json(rows);
});

router.get("/changelog/unseen-count", requireAuth, async (req: AuthedRequest, res) => {
  const seen = await prisma.changelogSeen.findUnique({ where: { userId: req.user!.id } });
  const count = await prisma.changelogEntry.count({
    where: seen ? { createdAt: { gt: seen.lastSeenAt } } : {},
  });
  res.json({ count });
});

router.post("/changelog/mark-seen", requireAuth, async (req: AuthedRequest, res) => {
  const row = await prisma.changelogSeen.upsert({
    where: { userId: req.user!.id },
    create: { userId: req.user!.id },
    update: { lastSeenAt: new Date() },
  });
  res.json(row);
});

router.post("/changelog", requireAuth, async (req: AuthedRequest, res) => {
  if (!requireOwner(req, res)) return;
  const { title, description } = req.body as { title?: string; description?: string };
  if (!title?.trim() || !description?.trim()) return res.status(400).json({ error: "Enter a title and description." });
  const row = await prisma.changelogEntry.create({ data: { title: title.trim(), description: description.trim() } });
  res.status(201).json(row);
});

router.patch("/changelog/:id", requireAuth, async (req: AuthedRequest, res) => {
  if (!requireOwner(req, res)) return;
  const { title, description } = req.body as { title?: string; description?: string };
  const row = await prisma.changelogEntry.update({
    where: { id: req.params.id },
    data: { title: title?.trim() || undefined, description: description?.trim() || undefined },
  });
  res.json(row);
});

router.delete("/changelog/:id", requireAuth, async (req: AuthedRequest, res) => {
  if (!requireOwner(req, res)) return;
  await prisma.changelogEntry.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
