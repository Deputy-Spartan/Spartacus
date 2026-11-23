import { Router } from "express";
import { prisma } from "@spartacus/db";
import {
  DAY_NAMES,
  KD_STATE_KEY,
  MONEY_STATE_KEY,
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
  const { voters: _v, bets: _b, seen: _s, ...rest } = st;
  void kind;
  return rest;
}

// ---- Live data (read fresh each time) ----
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

async function live(guildId: string, row: ToolRow, kind: ToolKind): Promise<Record<string, unknown>> {
  switch (kind) {
    case "stats": {
      const money = cleanMoney(await getRow(guildId, MONEY_STATE_KEY));
      const kd = cleanKd(await getRow(guildId, KD_STATE_KEY));
      const wl = cleanOverlay("winloss", await getRow(guildId, overlayStateKey("winloss")));
      const goal = cleanOverlay("goal", await getRow(guildId, overlayStateKey("goal")));
      const game = cleanOverlay("game", await getRow(guildId, overlayStateKey("game")));
      const s = row.settings;
      const wins = Number(wl.wins) || 0, losses = Number(wl.losses) || 0;
      const out: Record<string, unknown> = {
        money: formatMoney(money.amount, money.prefix, money.suffix),
        kd: `${kd.kills} / ${kd.deaths}`,
        ratio: (kd.kills / Math.max(1, kd.deaths)).toFixed(2),
        wl: `${wins} - ${losses}`,
        winrate: `${wins + losses ? Math.round((wins / (wins + losses)) * 100) : 0}%`,
        goal: `${Number(goal.cur).toLocaleString()} / ${Number(goal.target).toLocaleString()}`,
        game: String(game.game || ""),
      };
      // Only read the rest when they're switched on.
      if (s.showTimer) {
        const t = cleanOverlay("timer", await getRow(guildId, overlayStateKey("timer")));
        out.timer = { ...(t.timer as object), up: t.timerMode === "up", label: String(t.timerLabel || "TIMER") };
      }
      if (s.showChallenge) {
        const c = cleanOverlay("challenge", await getRow(guildId, overlayStateKey("challenge")));
        out.challenge = Number(c.count).toLocaleString();
        out.challengeLabel = String(c.chLabel || "CHALLENGE");
      }
      if (s.showLatest) {
        const tk = cleanOverlay("ticker", await getRow(guildId, overlayStateKey("ticker")));
        out.latest = tk.name && tk.name !== "—" ? String(tk.name) : "";
      }
      if (s.showNext) out.next = nextText(await cached(`next:${guildId}`, 30_000, () => nextStream(guildId)));
      return out;
    }
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
