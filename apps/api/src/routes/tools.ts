import { Router } from "express";
import { prisma } from "@spartacus/db";
import {
  DAY_NAMES,
  KD_STATE_KEY,
  MONEY_STATE_KEY,
  SOCIAL_PLATFORMS,
  applyToolAction,
  cleanKd,
  cleanMoney,
  cleanOverlay,
  cleanToolRow,
  cleanToolSettings,
  formatMoney,
  isToolKind,
  overlayStateKey,
  toolStateKey,
  type SocialPlatformId,
  type ToolKind,
  type ToolRow,
} from "@spartacus/shared";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { getBotClient } from "../lib/botClient";
import { isHidden, loadVisibility, setShown } from "../lib/overlayVisibility";
import { isOverlayId } from "@spartacus/shared";

const router = Router();

// Streaming › Overlays › stream tools (Alerts, Chat box, Scenes, Stats bar,
// Giveaway, Leaderboard, Next stream, Subathon, Webcam frame, Clip marker,
// Command tips, QR code, Squad box, Poll, Spin wheel, Dice & coin,
// Predictions, First-time welcome). One StreamDeckState row each.

const validGuild = (id: string) => /^\d{5,25}$/.test(id);
async function getRow(guildId: string, key: string) {
  return (await prisma.streamDeckState.findUnique({ where: { guildId_key: { guildId, key } } }))?.value;
}
async function putRow(guildId: string, key: string, value: object) {
  await prisma.streamDeckState.upsert({ where: { guildId_key: { guildId, key } }, create: { guildId, key, value }, update: { value } });
}
export const loadTool = async (guildId: string, kind: ToolKind) => cleanToolRow(kind, await getRow(guildId, toolStateKey(kind)));
export async function changeTool(guildId: string, kind: ToolKind, action: Record<string, unknown>) {
  const next = applyToolAction(kind, await loadTool(guildId, kind), action);
  if ("error" in next) return next;
  await putRow(guildId, toolStateKey(kind), next);
  return next;
}

// What the overlay needs from state (the big lists stay on the server).
function publicState(kind: ToolKind, st: Record<string, unknown>) {
  const { voters: _v, bets: _b, seen: _s, names, ...rest } = st;
  if (kind === "giveaway") return { ...rest, entries: Array.isArray(names) ? names.length : 0 };
  return rest;
}

// ---- Live data (read fresh each time) ----
const memberName = async (guildId: string, userId: string) => {
  const g = getBotClient()?.guilds.cache.get(guildId);
  const m = g?.members.cache.get(userId) ?? (await g?.members.fetch(userId).catch(() => null));
  return m?.displayName ?? "Someone";
};
const cache = new Map<string, { at: number; v: unknown }>();
async function cached<T>(key: string, ms: number, f: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.v as T;
  const v = await f();
  cache.set(key, { at: Date.now(), v });
  return v;
}

// The next stream on the schedule, as "FRIDAY · 7:00 PM" and how long until then.
async function nextStream(guildId: string) {
  const cfg = await prisma.streamExtrasConfig.findUnique({ where: { guildId } }).catch(() => null);
  const tz = cfg?.scheduleTimezone || "UTC";
  const slots = await prisma.streamSlot.findMany({ where: { guildId } }).catch(() => []);
  if (!slots.length) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  const nowDay = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  const nowMin = (Number(parts.hour) % 24) * 60 + Number(parts.minute);
  let best: { delta: number; day: number; slot: (typeof slots)[number] } | null = null;
  for (const slot of slots) {
    const days = slot.repeat === "DAILY" ? [0, 1, 2, 3, 4, 5, 6] : slot.repeat === "WEEKDAYS" ? [1, 2, 3, 4, 5] : slot.repeat === "WEEKENDS" ? [0, 6] : [slot.dayOfWeek];
    for (const d of days) {
      let delta = ((d - nowDay + 7) % 7) * 1440 + slot.startMinutes - nowMin;
      if (delta < -slot.durationMin) delta += 7 * 1440;
      if (delta < 0) delta = 0; // on now
      if (!best || delta < best.delta) best = { delta, day: d, slot };
    }
  }
  if (!best) return null;
  const h = Math.floor(best.slot.startMinutes / 60), m = best.slot.startMinutes % 60;
  const time = `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
  return { whenText: `${DAY_NAMES[best.day].toUpperCase()} · ${time}`, inMs: best.delta * 60000, game: best.slot.message || best.slot.streamTitle || best.slot.title || "" };
}
const nextText = (n: Awaited<ReturnType<typeof nextStream>>) => (n ? n.whenText.replace(" · ", " ").toLowerCase().replace(/^\w|\s\w/g, (c) => c.toUpperCase()) : "");

async function socials(guildId: string) {
  const row = await prisma.socialsOverlay.findUnique({ where: { guildId } }).catch(() => null);
  const platforms = (Array.isArray(row?.platforms) ? row!.platforms : []) as Array<{ id: string; on?: boolean; name?: string }>;
  return platforms.filter((p) => p.on && p.name && p.id !== "discord" && SOCIAL_PLATFORMS[p.id as SocialPlatformId]).map((p) => `${SOCIAL_PLATFORMS[p.id as SocialPlatformId].label}: ${p.name}`);
}
async function discordInvite(guildId: string) {
  const ov = cleanOverlay("discord", await getRow(guildId, overlayStateKey("discord")));
  if (ov.invite) return String(ov.invite);
  const row = await prisma.socialsOverlay.findUnique({ where: { guildId } }).catch(() => null);
  const d = ((Array.isArray(row?.platforms) ? row!.platforms : []) as Array<{ id: string; name?: string; url?: string }>).find((p) => p.id === "discord");
  if (!d?.name && !d?.url) return "";
  return (d.url || `discord.gg/${String(d.name).replace(/^https?:\/\/(discord\.gg|discord\.com\/invite)\//, "")}`).replace(/^https?:\/\//, "");
}

const gwTotals = new Map<string, number>(); // how long each giveaway ran, from when we first saw it
async function live(guildId: string, row: ToolRow, kind: ToolKind): Promise<Record<string, unknown>> {
  switch (kind) {
    case "scenes":
      return cached(`scenes:${guildId}`, 10_000, async () => {
        const game = cleanOverlay("game", await getRow(guildId, overlayStateKey("game")));
        const nx = await nextStream(guildId);
        return { game: String(game.game || ""), socials: await socials(guildId), discord: await discordInvite(guildId), next: nextText(nx) };
      });
    case "stats": {
      const money = cleanMoney(await getRow(guildId, MONEY_STATE_KEY));
      const kd = cleanKd(await getRow(guildId, KD_STATE_KEY));
      const wl = cleanOverlay("winloss", await getRow(guildId, overlayStateKey("winloss")));
      const goal = cleanOverlay("goal", await getRow(guildId, overlayStateKey("goal")));
      const game = cleanOverlay("game", await getRow(guildId, overlayStateKey("game")));
      return {
        money: formatMoney(money.amount, money.prefix, money.suffix),
        kd: `${kd.kills} / ${kd.deaths}`,
        wl: `${wl.wins} - ${wl.losses}`,
        goal: `${Number(goal.cur).toLocaleString()} / ${Number(goal.target).toLocaleString()}`,
        game: String(game.game || ""),
      };
    }
    case "giveaway": {
      if (row.settings.source !== "discord") return {};
      return cached(`gw:${guildId}`, 3000, async () => {
        const gw = await prisma.giveaway.findFirst({ where: { guildId, OR: [{ ended: false }, { endsAt: { gt: new Date(Date.now() - 5 * 60000) } }] }, orderBy: { endsAt: "desc" }, include: { _count: { select: { entries: true } } } }).catch(() => null);
        if (!gw) return {};
        const endsAt = gw.endsAt.getTime();
        if (!gwTotals.has(gw.id)) gwTotals.set(gw.id, Math.max(60000, endsAt - Date.now()));
        return { gw: { prize: gw.prize, entries: gw._count.entries, endsAt, total: gwTotals.get(gw.id), ended: gw.ended || endsAt <= Date.now() } };
      });
    }
    case "leader":
      return cached(`leader:${guildId}`, 15_000, async () => {
        const since = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
        const week = await prisma.streamViewerDay.groupBy({ by: ["userId"], where: { guildId, day: { gte: since } }, _sum: { messages: true }, orderBy: { _sum: { messages: "desc" } }, take: 8 }).catch(() => []);
        const xp = await prisma.memberXp.findMany({ where: { guildId }, orderBy: { xp: "desc" }, take: 8 }).catch(() => []);
        return {
          boards: {
            chat: (row.state.chatTop as Array<[string, number]>) ?? [],
            votw: await Promise.all(week.map(async (w) => [await memberName(guildId, w.userId), w._sum.messages ?? 0])),
            xp: await Promise.all(xp.map(async (x) => [await memberName(guildId, x.userId), x.level])),
          },
        };
      });
    case "next":
      return cached(`next:${guildId}`, 30_000, async () => ({ next: await nextStream(guildId) }));
    case "squad":
      return cached(`squad:${guildId}`, 2000, async () => {
        const g = getBotClient()?.guilds.cache.get(guildId);
        if (!g) return { people: [] };
        const who = String(row.settings.followUserId || "");
        const vc = who ? g.voiceStates.cache.get(who)?.channel : null;
        if (!vc) return { people: [] };
        return { people: [...vc.members.values()].map((m) => ({ name: m.displayName, muted: !!(m.voice.selfMute || m.voice.serverMute), avatar: m.displayAvatarURL({ size: 64, extension: "png" }) })) };
      });
    default:
      return {};
  }
}

// ---- Routes ----
router.get("/guilds/:guildId/tool/:kind", requireAuth, requireGuildPermission, async (req, res) => {
  if (!isToolKind(req.params.kind)) return res.status(404).json({ error: "No tool like that." });
  res.json(await loadTool(req.params.guildId, req.params.kind));
});

// The settings only; state and events are kept.
router.put("/guilds/:guildId/tool/:kind", requireAuth, requireGuildPermission, async (req, res) => {
  const kind = req.params.kind;
  if (!isToolKind(kind)) return res.status(404).json({ error: "No tool like that." });
  const row = await loadTool(req.params.guildId, kind);
  row.settings = cleanToolSettings(kind, (req.body as { settings?: unknown })?.settings ?? req.body);
  await putRow(req.params.guildId, toolStateKey(kind), row);
  res.json(row);
});

router.post("/guilds/:guildId/tool/:kind/action", requireAuth, requireGuildPermission, async (req, res) => {
  const kind = req.params.kind;
  if (!isToolKind(kind)) return res.status(404).json({ error: "No tool like that." });
  const body = (req.body ?? {}) as Record<string, unknown>;
  // A clip mark remembers how far into the stream it was.
  if (kind === "clip") {
    const live = await prisma.streamSubscription.findFirst({ where: { guildId: req.params.guildId, isLive: true }, orderBy: { lastNotifiedAt: "desc" } }).catch(() => null);
    if (live?.lastNotifiedAt) body.into = Date.now() - live.lastNotifiedAt.getTime();
  }
  const next = await changeTool(req.params.guildId, kind, body);
  if ("error" in next) return res.status(400).json(next);
  res.json(next);
});

// Public: OBS reads this every second.
router.get("/public/tool/:kind/:guildId", async (req, res) => {
  const kind = req.params.kind;
  if (!isToolKind(kind) || !validGuild(req.params.guildId)) return res.status(404).json({ error: "Not found" });
  const row = await loadTool(req.params.guildId, kind);
  res.set("Cache-Control", "no-store").json({
    settings: row.settings,
    state: publicState(kind, row.state),
    events: row.events.filter((e) => Date.now() - e.at < 60_000),
    live: await live(req.params.guildId, row, kind).catch(() => ({})),
    hidden: await isHidden(req.params.guildId, kind),
    now: Date.now(),
  });
});

// ---- Show or hide any overlay on stream ----
router.get("/guilds/:guildId/overlay-visibility", requireAuth, requireGuildPermission, async (req, res) => {
  res.json(await loadVisibility(req.params.guildId));
});
router.post("/guilds/:guildId/overlay-visibility", requireAuth, requireGuildPermission, async (req, res) => {
  const { id, on } = (req.body ?? {}) as { id?: unknown; on?: unknown };
  if (!isOverlayId(id)) return res.status(400).json({ error: "No overlay like that." });
  res.json(await setShown(req.params.guildId, id, on !== false));
});

export default router;
