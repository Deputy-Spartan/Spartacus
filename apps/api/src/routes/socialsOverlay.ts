import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

// The stream lower third with your platform names (Streaming › Socials Overlay).
const PLATFORM_IDS = ["twitch", "kick", "youtube", "tiktok", "x", "discord", "instagram"] as const;
const STYLES = ["sticker", "gold"];
const POSITIONS = ["left", "center", "right"];

type Platform = { id: string; on: boolean; name: string };

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// Every platform once, in the saved order, with anything unknown dropped.
function cleanPlatforms(input: unknown): Platform[] {
  const rows = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const out: Platform[] = [];
  for (const r of rows as Array<Partial<Platform>>) {
    const id = String(r?.id ?? "");
    if (!(PLATFORM_IDS as readonly string[]).includes(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, on: !!r.on, name: String(r.name ?? "").trim().slice(0, 40) });
  }
  for (const id of PLATFORM_IDS) if (!seen.has(id)) out.push({ id, on: false, name: "" });
  return out;
}

async function load(guildId: string) {
  const row = await prisma.socialsOverlay.findUnique({ where: { guildId } });
  return {
    platforms: cleanPlatforms(row?.platforms),
    style: row?.style ?? "sticker",
    pos: row?.pos ?? "left",
    size: row?.size ?? 100,
    hold: row?.hold ?? 0,
    every: row?.every ?? 0,
    updatedAt: row?.updatedAt?.toISOString() ?? null,
  };
}

router.get("/guilds/:guildId/socials-overlay", requireAuth, requireGuildPermission, async (req, res) => {
  res.json(await load(req.params.guildId));
});

router.put("/guilds/:guildId/socials-overlay", requireAuth, requireGuildPermission, async (req, res) => {
  const b = req.body as Record<string, unknown>;
  const data = {
    platforms: cleanPlatforms(b.platforms),
    style: STYLES.includes(String(b.style)) ? String(b.style) : "sticker",
    pos: POSITIONS.includes(String(b.pos)) ? String(b.pos) : "left",
    size: clampInt(b.size, 30, 200, 100),
    hold: clampInt(b.hold, 0, 600, 0),
    every: clampInt(b.every, 0, 120, 0),
  };
  await prisma.socialsOverlay.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, ...data },
    update: data,
  });
  res.json(await load(req.params.guildId));
});

// Public: OBS reads this to draw the overlay. Only the names you chose to
// show on stream are in it, which viewers see anyway.
router.get("/public/socials-overlay/:guildId", async (req, res) => {
  if (!/^\d{5,25}$/.test(req.params.guildId)) return res.status(404).json({ error: "Not found" });
  const s = await load(req.params.guildId);
  res.set("Cache-Control", "no-store").json({
    platforms: s.platforms.filter((p) => p.on && p.name),
    style: s.style,
    pos: s.pos,
    size: s.size,
    hold: s.hold,
    every: s.every,
    updatedAt: s.updatedAt,
  });
});

export default router;
