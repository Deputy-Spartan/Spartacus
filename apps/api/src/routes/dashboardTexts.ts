import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuthOnly, type AuthedRequest } from "../middleware/requireAuth";
import { requireOwner } from "../middleware/requireOwner";

// The owner's own wording for the dashboard's explanation text. One set for
// the whole dashboard, so a change shows for everyone on every server.

const router = Router();
const KEY = /^[a-z0-9._-]{1,120}$/i;

router.get("/dashboard-texts", requireAuthOnly, async (_req, res) => {
  const rows = await prisma.dashboardText.findMany();
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.text])));
});

// Empty text removes the override, going back to the built-in wording.
router.put("/dashboard-texts/:key", requireAuthOnly, requireOwner, async (req: AuthedRequest, res) => {
  const { key } = req.params;
  if (!KEY.test(key)) return res.status(400).json({ error: "Bad text key" });
  const text = String(req.body?.text ?? "").trim().slice(0, 2000);
  if (!text) {
    await prisma.dashboardText.deleteMany({ where: { key } });
    return res.json({ key, text: null });
  }
  const row = await prisma.dashboardText.upsert({ where: { key }, create: { key, text }, update: { text } });
  res.json({ key, text: row.text });
});

export default router;
