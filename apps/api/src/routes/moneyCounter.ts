import { Router } from "express";
import { prisma } from "@spartacus/db";
import { MONEY_STATE_KEY, cleanMoney, clampMoney, type MoneyCounter } from "@spartacus/shared";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

// Streaming › Money Counter. The number and its look live in StreamDeckState
// (key "money"), the same place the Stream Deck keys change it.

async function load(guildId: string): Promise<MoneyCounter> {
  const row = await prisma.streamDeckState.findUnique({ where: { guildId_key: { guildId, key: MONEY_STATE_KEY } } });
  return cleanMoney(row?.value);
}
async function save(guildId: string, value: MoneyCounter) {
  await prisma.streamDeckState.upsert({
    where: { guildId_key: { guildId, key: MONEY_STATE_KEY } },
    create: { guildId, key: MONEY_STATE_KEY, value: { ...value } },
    update: { value: { ...value } },
  });
  return value;
}

router.get("/guilds/:guildId/money-counter", requireAuth, requireGuildPermission, async (req, res) => {
  res.json(await load(req.params.guildId));
});

// The look only. The number is changed with /amount, so saving the look never
// undoes a Stream Deck press that happened a second earlier.
router.put("/guilds/:guildId/money-counter", requireAuth, requireGuildPermission, async (req, res) => {
  const cur = await load(req.params.guildId);
  const next = cleanMoney({ ...(req.body as object), amount: cur.amount });
  res.json(await save(req.params.guildId, next));
});

// { add: 500 } or { set: 0 }
router.post("/guilds/:guildId/money-counter/amount", requireAuth, requireGuildPermission, async (req, res) => {
  const b = req.body as { add?: unknown; set?: unknown };
  const cur = await load(req.params.guildId);
  if (b.set !== undefined && Number.isFinite(Number(b.set))) cur.amount = clampMoney(Number(b.set));
  else if (b.add !== undefined && Number.isFinite(Number(b.add))) cur.amount = clampMoney(cur.amount + Number(b.add));
  else return res.status(400).json({ error: "Type an amount." });
  res.json(await save(req.params.guildId, cur));
});

// Public: the OBS overlay reads this every second. It's only what's on stream.
router.get("/public/money-counter/:guildId", async (req, res) => {
  if (!/^\d{5,25}$/.test(req.params.guildId)) return res.status(404).json({ error: "Not found" });
  res.set("Cache-Control", "no-store").json(await load(req.params.guildId));
});

export default router;
