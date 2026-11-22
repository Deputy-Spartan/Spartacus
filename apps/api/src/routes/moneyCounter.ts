import { Router } from "express";
import { prisma } from "@spartacus/db";
import { KD_STATE_KEY, MONEY_STATE_KEY, changeKd, cleanKd, cleanMoney, clampMoney } from "@spartacus/shared";
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
  res.set("Cache-Control", "no-store").json(await loadMoney(req.params.guildId));
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
  res.set("Cache-Control", "no-store").json(await loadKd(req.params.guildId));
});

export default router;
