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
const THEMES = ["studio", "glass", "daylight", "steel", "midnight", "dusk"] as const;
// Neon was replaced by Daylight; anyone who had picked it gets Studio.
const theme = (t: string) => (THEMES.includes(t as (typeof THEMES)[number]) ? t : "studio");
const HEX = /^#[0-9a-f]{6}$/i;
const DEFAULTS = { theme: "studio", accent: null as string | null, compact: false, reduceMotion: false, displayName: null as string | null };

type Row = { theme: string; accent: string | null; compact: boolean; reduceMotion: boolean; displayName: string | null };
const shape = (row: Row) => ({
  theme: theme(row.theme),
  accent: row.accent && HEX.test(row.accent) ? row.accent.toLowerCase() : null,
  compact: row.compact,
  reduceMotion: row.reduceMotion,
  displayName: row.displayName,
});

router.get("/me/prefs", requireAuthOnly, async (req: AuthedRequest, res) => {
  const row = await prisma.dashboardUserPrefs.findUnique({ where: { userId: req.user!.id } });
  res.json(row ? shape(row) : DEFAULTS);
});

router.put("/me/prefs", requireAuthOnly, async (req: AuthedRequest, res) => {
  const body = (req.body ?? {}) as { theme?: unknown; accent?: unknown; compact?: unknown; reduceMotion?: unknown; displayName?: unknown };
  const data: { theme?: string; accent?: string | null; compact?: boolean; reduceMotion?: boolean; displayName?: string | null } = {};
  if (body.theme !== undefined) {
    if (typeof body.theme !== "string" || !THEMES.includes(body.theme as (typeof THEMES)[number]))
      return void res.status(400).json({ error: "Pick Studio, Glass, Daylight, Steel, Midnight or Dusk." });
    data.theme = body.theme;
  }
  if (body.accent !== undefined) {
    // null (or "") goes back to the theme's own accent color.
    if (body.accent === null || body.accent === "") data.accent = null;
    else if (typeof body.accent === "string" && HEX.test(body.accent)) data.accent = body.accent.toLowerCase();
    else return void res.status(400).json({ error: "That color isn't valid. Pick one from the list or the color picker." });
  }
  if (body.compact !== undefined) data.compact = body.compact === true;
  if (body.reduceMotion !== undefined) data.reduceMotion = body.reduceMotion === true;
  if (body.displayName !== undefined) {
    const name = typeof body.displayName === "string" ? body.displayName.replace(/\s+/g, " ").trim() : "";
    if (name.length > 32) return void res.status(400).json({ error: "Keep your display name to 32 characters or fewer." });
    data.displayName = name || null;
  }
  const row = await prisma.dashboardUserPrefs.upsert({ where: { userId: req.user!.id }, create: { userId: req.user!.id, ...data }, update: data });
  res.json(shape(row));
});

export default router;
