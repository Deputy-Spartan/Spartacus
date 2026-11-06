import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuthOnly, type AuthedRequest } from "../middleware/requireAuth";

const router = Router();

// requireAuthOnly, not requireAuth — a logged-in-but-unapproved visitor
// still needs to know who they are to render the "access needed" screen.
router.get("/me", requireAuthOnly, (req: AuthedRequest, res) => {
  res.json(req.user);
});

// How the dashboard looks for this person. Saved to their Discord account,
// so it's the same on every device they sign in from.
const THEMES = ["studio", "glass", "neon"] as const;
const DEFAULTS = { theme: "studio", reduceMotion: false, displayName: null as string | null };

router.get("/me/prefs", requireAuthOnly, async (req: AuthedRequest, res) => {
  const row = await prisma.dashboardUserPrefs.findUnique({ where: { userId: req.user!.id } });
  res.json(row ? { theme: row.theme, reduceMotion: row.reduceMotion, displayName: row.displayName } : DEFAULTS);
});

router.put("/me/prefs", requireAuthOnly, async (req: AuthedRequest, res) => {
  const body = (req.body ?? {}) as { theme?: unknown; reduceMotion?: unknown; displayName?: unknown };
  const data: { theme?: string; reduceMotion?: boolean; displayName?: string | null } = {};
  if (body.theme !== undefined) {
    if (typeof body.theme !== "string" || !THEMES.includes(body.theme as (typeof THEMES)[number])) return void res.status(400).json({ error: "Pick Studio, Glass or Neon." });
    data.theme = body.theme;
  }
  if (body.reduceMotion !== undefined) data.reduceMotion = body.reduceMotion === true;
  if (body.displayName !== undefined) {
    const name = typeof body.displayName === "string" ? body.displayName.replace(/\s+/g, " ").trim() : "";
    if (name.length > 32) return void res.status(400).json({ error: "Keep your display name to 32 characters or fewer." });
    data.displayName = name || null;
  }
  const row = await prisma.dashboardUserPrefs.upsert({ where: { userId: req.user!.id }, create: { userId: req.user!.id, ...data }, update: data });
  res.json({ theme: row.theme, reduceMotion: row.reduceMotion, displayName: row.displayName });
});

export default router;
