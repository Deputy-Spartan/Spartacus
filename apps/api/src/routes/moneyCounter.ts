import { Router } from "express";
import { prisma } from "@spartacus/db";
import {
  KD_STATE_KEY,
  MONEY_STATE_KEY,
  applyOverlayAction,
  changeKd,
  cleanKd,
  cleanMoney,
  cleanOverlay,
  clampMoney,
  isOverlayKind,
  mergeOverlayLook,
  overlayStateKey,
  type OverlayKind,
} from "@spartacus/shared";
import { getBotClient } from "../lib/botClient";
import { isHidden } from "../lib/overlayVisibility";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

// Streaming › Money Counter and K/D Counter. Each lives in one StreamDeckState
// row (key "money" / "kd"), the same place the Stream Deck keys change it.

async function loadState(guildId: string, key: string) {
  const row = await prisma.streamDeckState.findUnique({ where: { guildId_key: { guildId, key } } });
  return row?.value;
}
async function saveState<T extends object>(guildId: string, key: string, value: T) {
  await prisma.streamDeckState.upsert({
    where: { guildId_key: { guildId, key } },
    create: { guildId, key, value: { ...value } },
    update: { value: { ...value } },
  });
  return value;
}
const validGuild = (id: string) => /^\d{5,25}$/.test(id);

// ---- Money ----
const loadMoney = async (guildId: string) => cleanMoney(await loadState(guildId, MONEY_STATE_KEY));

router.get("/guilds/:guildId/money-counter", requireAuth, requireGuildPermission, async (req, res) => {
  res.json(await loadMoney(req.params.guildId));
});

// The look only. The number is changed with /amount, so saving the look never
// undoes a Stream Deck press that happened a second earlier.
router.put("/guilds/:guildId/money-counter", requireAuth, requireGuildPermission, async (req, res) => {
  const cur = await loadMoney(req.params.guildId);
  res.json(await saveState(req.params.guildId, MONEY_STATE_KEY, cleanMoney({ ...(req.body as object), amount: cur.amount })));
});

// { add: 500 } or { set: 0 }
router.post("/guilds/:guildId/money-counter/amount", requireAuth, requireGuildPermission, async (req, res) => {
  const b = req.body as { add?: unknown; set?: unknown };
  const cur = await loadMoney(req.params.guildId);
  if (b.set !== undefined && Number.isFinite(Number(b.set))) cur.amount = clampMoney(Number(b.set));
  else if (b.add !== undefined && Number.isFinite(Number(b.add))) cur.amount = clampMoney(cur.amount + Number(b.add));
  else return res.status(400).json({ error: "Type an amount." });
  res.json(await saveState(req.params.guildId, MONEY_STATE_KEY, cur));
});

router.get("/public/money-counter/:guildId", async (req, res) => {
  if (!validGuild(req.params.guildId)) return res.status(404).json({ error: "Not found" });
  res.set("Cache-Control", "no-store").json({ ...(await loadMoney(req.params.guildId)), hidden: await isHidden(req.params.guildId, "money") });
});

// ---- Kills & deaths ----
const loadKd = async (guildId: string) => cleanKd(await loadState(guildId, KD_STATE_KEY));

router.get("/guilds/:guildId/kd-counter", requireAuth, requireGuildPermission, async (req, res) => {
  res.json(await loadKd(req.params.guildId));
});

// The look only; kills, deaths and the streak are kept as they are.
router.put("/guilds/:guildId/kd-counter", requireAuth, requireGuildPermission, async (req, res) => {
  const cur = await loadKd(req.params.guildId);
  res.json(await saveState(req.params.guildId, KD_STATE_KEY, cleanKd({ ...(req.body as object), kills: cur.kills, deaths: cur.deaths, streak: cur.streak })));
});

// { stat: "kills" | "deaths" | "both", add: 1 } or { stat, set: 0 }
router.post("/guilds/:guildId/kd-counter/change", requireAuth, requireGuildPermission, async (req, res) => {
  const b = req.body as { stat?: unknown; add?: unknown; set?: unknown };
  const stat = b.stat === "deaths" ? "deaths" : b.stat === "both" ? "both" : "kills";
  const cur = await loadKd(req.params.guildId);
  let next;
  if (b.set !== undefined && Number.isFinite(Number(b.set))) next = changeKd(cur, stat, { set: Number(b.set) });
  else if (b.add !== undefined && Number.isFinite(Number(b.add)) && stat !== "both") next = changeKd(cur, stat, { add: Number(b.add) });
  else return res.status(400).json({ error: "Type an amount." });
  res.json(await saveState(req.params.guildId, KD_STATE_KEY, next));
});

router.get("/public/kd-counter/:guildId", async (req, res) => {
  if (!validGuild(req.params.guildId)) return res.status(404).json({ error: "Not found" });
  res.set("Cache-Control", "no-store").json({ ...(await loadKd(req.params.guildId)), hidden: await isHidden(req.params.guildId, "kd") });
});

// ---- Game, Win/Loss, Timer, Goal, Challenge, Discord box, Latest follower ----
const loadOverlay = async (guildId: string, kind: OverlayKind) => cleanOverlay(kind, await loadState(guildId, overlayStateKey(kind)));

router.get("/guilds/:guildId/overlay/:kind", requireAuth, requireGuildPermission, async (req, res) => {
  if (!isOverlayKind(req.params.kind)) return res.status(404).json({ error: "No overlay like that." });
  res.json(await loadOverlay(req.params.guildId, req.params.kind));
});

// The look only; the numbers are kept as they are.
router.put("/guilds/:guildId/overlay/:kind", requireAuth, requireGuildPermission, async (req, res) => {
  const kind = req.params.kind;
  if (!isOverlayKind(kind)) return res.status(404).json({ error: "No overlay like that." });
  const cur = await loadOverlay(req.params.guildId, kind);
  res.json(await saveState(req.params.guildId, overlayStateKey(kind), mergeOverlayLook(kind, cur, req.body)));
});

router.post("/guilds/:guildId/overlay/:kind/action", requireAuth, requireGuildPermission, async (req, res) => {
  const kind = req.params.kind;
  if (!isOverlayKind(kind)) return res.status(404).json({ error: "No overlay like that." });
  const next = applyOverlayAction(kind, await loadOverlay(req.params.guildId, kind), (req.body ?? {}) as Record<string, unknown>);
  if ("error" in next) return res.status(400).json(next);
  res.json(await saveState(req.params.guildId, overlayStateKey(kind), next));
});

// Live member and online counts for the Discord box, asked of Discord at most
// once a minute per server.
const countCache = new Map<string, { at: number; members: number; online: number }>();
async function discordCounts(guildId: string) {
  const hit = countCache.get(guildId);
  if (hit && Date.now() - hit.at < 60_000) return hit;
  const client = getBotClient();
  const g = await client?.guilds.fetch({ guild: guildId, withCounts: true, force: true }).catch(() => null);
  const counts = { at: Date.now(), members: g?.approximateMemberCount ?? g?.memberCount ?? hit?.members ?? 0, online: g?.approximatePresenceCount ?? hit?.online ?? 0 };
  countCache.set(guildId, counts);
  return counts;
}
// The invite, if it's left empty: the Discord one from Streaming › Socials.
async function socialsInvite(guildId: string) {
  const row = await prisma.socialsOverlay.findUnique({ where: { guildId } }).catch(() => null);
  const d = (Array.isArray(row?.platforms) ? (row!.platforms as Array<{ id?: string; name?: string; url?: string }>) : []).find((p) => p.id === "discord");
  if (!d?.name && !d?.url) return "";
  return (d.url || `discord.gg/${String(d.name).replace(/^https?:\/\/(discord\.gg|discord\.com\/invite)\//, "")}`).replace(/^https?:\/\//, "");
}

// Public: OBS reads this every second. `now` lets the overlay line its clock
// up with the server's, so the timer is right even if the PC clock is off.
router.get("/public/overlay/:kind/:guildId", async (req, res) => {
  const kind = req.params.kind;
  if (!isOverlayKind(kind) || !validGuild(req.params.guildId)) return res.status(404).json({ error: "Not found" });
  const st: Record<string, unknown> = { ...(await loadOverlay(req.params.guildId, kind)), now: Date.now(), hidden: await isHidden(req.params.guildId, kind) };
  if (kind === "discord") {
    const c = await discordCounts(req.params.guildId);
    st.members = c.members;
    st.online = c.online;
    if (!st.invite) st.invite = (await socialsInvite(req.params.guildId)) || "discord.gg/yourcode";
  }
  res.set("Cache-Control", "no-store").json(st);
});

export default router;
