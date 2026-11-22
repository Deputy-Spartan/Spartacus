import { Router } from "express";
import { prisma } from "@spartacus/db";
import { SOCIAL_PLATFORM_IDS } from "@spartacus/shared";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { getBotClient } from "../lib/botClient";

const router = Router();

// Streaming › Socials: the stream lower third with your platform names (OBS)
// and the socials post in Discord.
const STYLES = ["sticker", "gold"];
const POSITIONS = ["left", "center", "right"];
const POST_STYLES = ["embed", "plain"];

// on = shown on stream, post = in the Discord post.
// url = your own link (optional); empty means it's built from the name.
type Platform = { id: string; on: boolean; post: boolean; name: string; url: string };

// Only http(s) links, so nothing odd ends up behind a name in Discord.
const cleanUrl = (v: unknown) => {
  const u = String(v ?? "").trim().slice(0, 300);
  if (!u) return "";
  try {
    const parsed = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? u : "";
  } catch {
    return "";
  }
};

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
    if (!(SOCIAL_PLATFORM_IDS as readonly string[]).includes(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, on: !!r.on, post: r.post === undefined ? !!r.on : !!r.post, name: String(r.name ?? "").trim().slice(0, 60), url: cleanUrl(r.url) });
  }
  for (const id of SOCIAL_PLATFORM_IDS) if (!seen.has(id)) out.push({ id, on: false, post: false, name: "", url: "" });
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
    postChannelId: row?.postChannelId ?? null,
    postStyle: row?.postStyle ?? "embed",
    postTitle: row?.postTitle ?? null,
    postText: row?.postText ?? null,
    posted: row?.postMessageId && row.postedChannelId ? { channelId: row.postedChannelId, messageId: row.postMessageId } : null,
    updatedAt: row?.updatedAt?.toISOString() ?? null,
  };
}

router.get("/guilds/:guildId/socials-overlay", requireAuth, requireGuildPermission, async (req, res) => {
  res.json(await load(req.params.guildId));
});

router.put("/guilds/:guildId/socials-overlay", requireAuth, requireGuildPermission, async (req, res) => {
  const b = req.body as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);
  const data = {
    platforms: cleanPlatforms(b.platforms),
    style: STYLES.includes(String(b.style)) ? String(b.style) : "sticker",
    pos: POSITIONS.includes(String(b.pos)) ? String(b.pos) : "left",
    size: clampInt(b.size, 30, 200, 100),
    hold: clampInt(b.hold, 0, 600, 0),
    every: clampInt(b.every, 0, 120, 0),
    postChannelId: typeof b.postChannelId === "string" && /^\d{5,25}$/.test(b.postChannelId) ? b.postChannelId : null,
    postStyle: POST_STYLES.includes(String(b.postStyle)) ? String(b.postStyle) : "embed",
    postTitle: text(b.postTitle, 256),
    postText: text(b.postText, 1000),
  };
  await prisma.socialsOverlay.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, ...data },
    update: data,
  });
  res.json(await load(req.params.guildId));
});

// Post the socials message in Discord, or update the one already there.
router.post("/guilds/:guildId/socials-overlay/post", requireAuth, requireGuildPermission, async (req, res) => {
  const client = getBotClient();
  if (!client) return res.status(503).json({ error: "The bot is offline. Try again in a minute." });
  const { postSocials } = await import("@spartacus/bot");
  const result = await postSocials(client, req.params.guildId);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json({ url: result.url, settings: await load(req.params.guildId) });
});

router.delete("/guilds/:guildId/socials-overlay/post", requireAuth, requireGuildPermission, async (req, res) => {
  const client = getBotClient();
  if (!client) return res.status(503).json({ error: "The bot is offline. Try again in a minute." });
  const { removeSocialsPost } = await import("@spartacus/bot");
  await removeSocialsPost(client, req.params.guildId);
  res.json(await load(req.params.guildId));
});

// Public: OBS reads this to draw the overlay. Only the names you chose to
// show on stream are in it, which viewers see anyway.
router.get("/public/socials-overlay/:guildId", async (req, res) => {
  if (!/^\d{5,25}$/.test(req.params.guildId)) return res.status(404).json({ error: "Not found" });
  const s = await load(req.params.guildId);
  res.set("Cache-Control", "no-store").json({
    platforms: s.platforms.filter((p) => p.on && p.name).map((p) => ({ id: p.id, name: p.name })),
    style: s.style,
    pos: s.pos,
    size: s.size,
    hold: s.hold,
    every: s.every,
    updatedAt: s.updatedAt,
  });
});

export default router;
