import { Router, type Response } from "express";
import { prisma, entitlementLive, forgetGuildPlan, guildPlanState, plansEnforced, refreshBuyers, storeUrl } from "@spartacus/db";
import { PLAN_TIERS, tiersForProducts, unlocksForProducts, type GuildPlanState, type PlanPurchase, type PlanTier } from "@spartacus/shared";
import { requireAuth, isOwner, type AuthedRequest } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { getBotClient } from "../lib/botClient";

// Paid plans (Outpost Gaming store). The dashboard's Plans page:
//   GET    /guilds/:guildId/plan                what this server has (drives every 🔒)
//   GET    /me/plans                            what you bought, and which server each one is on
//   POST   /me/plans/:entitlementId/assign      { guildId } put a plan on a server (or move it)
//   DELETE /me/plans/:entitlementId/assign      take it off its server
//   PUT    /guilds/:guildId/plan/gift           { tiers } bot owner only: give a server plans for free ([] = remove)
const router = Router();
const MANAGE = 0x20n | 0x8n;
const uid = (req: AuthedRequest) => req.session?.id ?? req.user?.id ?? "";

function canManage(req: AuthedRequest, guildId: string) {
  const g = req.session?.guilds.find((x) => x.id === guildId);
  return !!g && (BigInt(g.permissions) & MANAGE) !== 0n;
}
function guildName(req: AuthedRequest, guildId: string | null) {
  if (!guildId) return null;
  return req.session?.guilds.find((x) => x.id === guildId)?.name ?? getBotClient()?.guilds.cache.get(guildId)?.name ?? "A server you can't manage";
}
function storeDown(res: Response, e: unknown) {
  console.warn("[plans] store:", e instanceof Error ? e.message : e);
  return res.status(503).json({ error: "Couldn't reach the Outpost Gaming store. Try again in a minute." });
}

router.get("/guilds/:guildId/plan", requireAuth, requireGuildPermission, async (req: AuthedRequest, res) => {
  const state = await guildPlanState(req.params.guildId);
  const out: GuildPlanState = { enforced: plansEnforced(), tiers: state.tiers, features: state.features, reason: state.reason, storeUrl: storeUrl() };
  res.json(out);
});

router.get("/me/plans", requireAuth, async (req: AuthedRequest, res) => {
  if (!plansEnforced()) return res.json({ enforced: false, storeUrl: storeUrl(), purchases: [], owner: isOwner(uid(req)) });
  let list;
  try {
    list = await refreshBuyers([uid(req)]);
  } catch (e) {
    return storeDown(res, e);
  }
  const rows = await prisma.guildPlan.findMany({ where: { ownerDiscordId: uid(req) } });
  const purchases: PlanPurchase[] = list
    .filter((e) => unlocksForProducts([e.productId]).length && !["refunded", "revoked"].includes(e.status))
    .map((e) => {
      const row = rows.find((r) => r.entitlementId === e.id);
      return {
        entitlementId: e.id,
        productId: e.productId,
        productName: e.productName,
        tiers: tiersForProducts([e.productId]),
        features: unlocksForProducts([e.productId]).filter((u) => !(PLAN_TIERS as readonly string[]).includes(u)),
        interval: e.interval,
        status: entitlementLive(e.status, e.periodEnd) ? "active" : e.status,
        periodEnd: e.periodEnd,
        guildId: row?.guildId ?? null,
        guildName: guildName(req, row?.guildId ?? null),
      };
    });
  res.json({ enforced: true, storeUrl: storeUrl(), purchases, owner: isOwner(uid(req)) });
});

router.post("/me/plans/:entitlementId/assign", requireAuth, async (req: AuthedRequest, res) => {
  const guildId = String(req.body?.guildId ?? "");
  if (!plansEnforced()) return res.status(400).json({ error: "Plans aren't switched on yet." });
  if (!/^\d{15,20}$/.test(guildId) || !canManage(req, guildId)) return res.status(403).json({ error: "Pick a server you manage." });
  if (!getBotClient()?.guilds.cache.has(guildId)) return res.status(400).json({ error: "Add Spartacus to that server first." });
  let list;
  try {
    list = await refreshBuyers([uid(req)]);
  } catch (e) {
    return storeDown(res, e);
  }
  const e = list.find((x) => x.id === req.params.entitlementId);
  if (!e) return res.status(404).json({ error: "That purchase isn't on your account." });
  const tiers = unlocksForProducts([e.productId]);
  if (!tiers.length) return res.status(400).json({ error: "That purchase doesn't unlock anything in Spartacus." });
  if (!entitlementLive(e.status, e.periodEnd)) return res.status(400).json({ error: "That plan isn't active. Check My Library on the store." });

  const before = await prisma.guildPlan.findUnique({ where: { entitlementId: e.id } });
  const data = { guildId, productId: e.productId, tiers, ownerDiscordId: uid(req), status: e.status, periodEnd: e.periodEnd ? new Date(e.periodEnd) : null, checkedAt: new Date() };
  await prisma.guildPlan.upsert({ where: { entitlementId: e.id }, create: { entitlementId: e.id, ...data }, update: data });
  if (before) forgetGuildPlan(before.guildId);
  forgetGuildPlan(guildId);
  res.json({ ok: true, guildId, guildName: guildName(req, guildId) });
});

router.delete("/me/plans/:entitlementId/assign", requireAuth, async (req: AuthedRequest, res) => {
  const row = await prisma.guildPlan.findUnique({ where: { entitlementId: req.params.entitlementId } });
  if (!row || row.ownerDiscordId !== uid(req)) return res.status(404).json({ error: "That plan isn't on a server." });
  await prisma.guildPlan.delete({ where: { id: row.id } });
  forgetGuildPlan(row.guildId);
  res.status(204).send();
});

router.put("/guilds/:guildId/plan/gift", requireAuth, requireGuildPermission, async (req: AuthedRequest, res) => {
  if (!isOwner(uid(req))) return res.status(403).json({ error: "Only the bot owner can give free plans." });
  const tiers = (Array.isArray(req.body?.tiers) ? req.body.tiers : []).filter((t: unknown): t is PlanTier => PLAN_TIERS.includes(t as PlanTier));
  const entitlementId = `gift:${req.params.guildId}`;
  if (!tiers.length) await prisma.guildPlan.deleteMany({ where: { entitlementId } });
  else {
    const data = { guildId: req.params.guildId, productId: "gift", tiers, ownerDiscordId: uid(req), status: "active", periodEnd: null, checkedAt: new Date() };
    await prisma.guildPlan.upsert({ where: { entitlementId }, create: { entitlementId, ...data }, update: data });
  }
  forgetGuildPlan(req.params.guildId);
  res.json({ tiers });
});

router.get("/guilds/:guildId/plan/gift", requireAuth, requireGuildPermission, async (req: AuthedRequest, res) => {
  if (!isOwner(uid(req))) return res.json({ tiers: [] });
  const row = await prisma.guildPlan.findUnique({ where: { entitlementId: `gift:${req.params.guildId}` } });
  res.json({ tiers: row?.tiers ?? [] });
});

export default router;
