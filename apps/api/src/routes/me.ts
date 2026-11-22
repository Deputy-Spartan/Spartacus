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
// The original themes (keep in step with the web app's lib/themeScript.ts
// THEME_IDS). A theme that's no longer offered (Forged A–Z, the gladiator
// six) reads back as Studio.
const THEMES: string[] = ["studio", "glass", "daylight", "steel", "midnight", "dusk", "jackpot"];
const theme = (t: string) => (THEMES.includes(t) ? t : "studio");
const HEX = /^#[0-9a-f]{6}$/i;
const GLOW = ["off", "normal", "strong"];
const DEFAULTS = { theme: "studio", accent: null as string | null, compact: false, reduceMotion: false, displayName: null as string | null, glow: "normal", texture: true };

type Row = { theme: string; accent: string | null; compact: boolean; reduceMotion: boolean; displayName: string | null; glow: string; texture: boolean };
const shape = (row: Row) => ({
  theme: theme(row.theme),
  accent: row.accent && HEX.test(row.accent) ? row.accent.toLowerCase() : null,
  compact: row.compact,
  reduceMotion: row.reduceMotion,
  displayName: row.displayName,
  glow: GLOW.includes(row.glow) ? row.glow : "normal",
  texture: row.texture,
});

router.get("/me/prefs", requireAuthOnly, async (req: AuthedRequest, res) => {
  const row = await prisma.dashboardUserPrefs.findUnique({ where: { userId: req.user!.id } });
  res.json(row ? shape(row) : DEFAULTS);
});

router.put("/me/prefs", requireAuthOnly, async (req: AuthedRequest, res) => {
  const body = (req.body ?? {}) as { theme?: unknown; accent?: unknown; compact?: unknown; reduceMotion?: unknown; displayName?: unknown; glow?: unknown; texture?: unknown };
  const data: { theme?: string; accent?: string | null; compact?: boolean; reduceMotion?: boolean; displayName?: string | null; glow?: string; texture?: boolean } = {};
  if (body.theme !== undefined) {
    if (typeof body.theme !== "string" || !THEMES.includes(body.theme)) return void res.status(400).json({ error: "That theme isn't available. Pick one from the list." });
    data.theme = body.theme;
  }
  if (body.glow !== undefined) {
    if (typeof body.glow !== "string" || !GLOW.includes(body.glow)) return void res.status(400).json({ error: "Pick Off, Normal or Strong for the glow." });
    data.glow = body.glow;
  }
  if (body.texture !== undefined) data.texture = body.texture === true;
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
