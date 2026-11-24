"use client";

import { useEffect, useState } from "react";
import { PLAN_TIERS, TIER_INFO, type PlanPurchase, type PlanTier } from "@spartacus/shared";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { api } from "../../../../lib/api";
import { refreshGuildPlan, useGuildPlan } from "../../../../lib/useGuildPlan";

// Plans: what this server has, what you bought on the Outpost Gaming store,
// and which server each purchase is on. Buying happens on the store; this
// page only places a plan on a server (one server per plan).
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null);

export default function PlansPage({ params }: { params: { guildId: string } }) {
  const guildId = params.guildId;
  const confirm = useConfirm();
  const plan = useGuildPlan(guildId);
  const [mine, setMine] = useState<{ enforced: boolean; storeUrl: string; owner: boolean; purchases: PlanPurchase[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [gift, setGift] = useState<PlanTier[]>([]);

  const load = () => {
    setError(null);
    api.getMyPlans().then(setMine).catch((e) => setError(e instanceof Error ? e.message : "Couldn't load your plans."));
  };
  useEffect(load, []);
  useEffect(() => {
    if (mine?.owner) api.getPlanGift(guildId).then((r) => setGift(r.tiers)).catch(() => null);
  }, [mine?.owner, guildId]);

  async function place(p: PlanPurchase) {
    if (p.guildId && p.guildId !== guildId && !(await confirm(`Move ${p.productName} from ${p.guildName ?? "its server"} to this server? That server goes back to the free features (its settings are kept).`, { title: "Move plan", confirmLabel: "Move it here" })))
      return;
    setBusy(p.entitlementId);
    setError(null);
    try {
      await api.assignPlan(p.entitlementId, guildId);
      if (p.guildId) refreshGuildPlan(p.guildId);
      refreshGuildPlan(guildId);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't put the plan here.");
    }
    setBusy(null);
  }
  async function remove(p: PlanPurchase) {
    if (!(await confirm(`Take ${p.productName} off ${p.guildName ?? "its server"}? Its paid features lock there until you put a plan back.`, { title: "Take plan off", confirmLabel: "Take it off", danger: true }))) return;
    setBusy(p.entitlementId);
    await api.unassignPlan(p.entitlementId).catch(() => null);
    if (p.guildId) refreshGuildPlan(p.guildId);
    load();
    setBusy(null);
  }
  async function toggleGift(t: PlanTier, on: boolean) {
    const next = on ? [...new Set([...gift, t])] : gift.filter((x) => x !== t);
    setGift(next);
    await api.setPlanGift(guildId, next).catch((e) => setError(e instanceof Error ? e.message : "Couldn't save."));
    refreshGuildPlan(guildId);
  }

  const store = mine?.storeUrl ?? plan?.storeUrl ?? null;
  const enforced = plan?.enforced ?? mine?.enforced ?? true;

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold mb-1">⭐ Plans</h1>
        <p className="text-slate-400">
          Spartacus is free. Paid plans from the Outpost Gaming store unlock more on one server each. Buy on the store with this Discord account, then put the plan on a server here.
        </p>
      </div>
      {error && <p className="text-sm text-rose-400">{error}</p>}

      <NeonCard className="space-y-3">
        <h2 className="font-semibold">This server</h2>
        {!enforced && <p className="text-sm text-slate-400">Paid plans aren&apos;t switched on yet, so every feature is open here.</p>}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {PLAN_TIERS.map((t) => {
            const has = !enforced || !!plan?.tiers.includes(t);
            return (
              <div key={t} className={`rounded-xl border p-3 ${has ? "border-emerald-500/40 bg-emerald-500/5" : "border-white/10"}`}>
                <p className="font-semibold">
                  {TIER_INFO[t].icon} {TIER_INFO[t].name}
                </p>
                <p className={`text-xs mt-1 ${has ? "text-emerald-400" : "text-slate-500"}`}>{has ? "✓ Unlocked" : "🔒 Locked"}</p>
              </div>
            );
          })}
        </div>
        {plan?.reason === "owner" && <p className="text-xs text-slate-500">This is your own server, so everything is always unlocked.</p>}
        {plan?.reason === "gift" && <p className="text-xs text-slate-500">This server was given a free plan by the bot owner.</p>}
      </NeonCard>

      <NeonCard className="space-y-3">
        <h2 className="font-semibold">Your purchases</h2>
        {!mine && !error && <p className="text-sm text-slate-500">Checking the store…</p>}
        {mine && !mine.purchases.length && (
          <p className="text-sm text-slate-400">
            Nothing yet. Plans you buy on the Outpost Gaming store with this Discord account show up here.
          </p>
        )}
        {mine?.purchases.map((p) => {
          const here = p.guildId === guildId;
          const live = p.status === "active";
          return (
            <div key={p.entitlementId} className="rounded-xl border border-white/10 p-3 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[200px]">
                <p className="font-semibold">{p.productName}</p>
                <p className="text-xs text-slate-400">
                  {p.tiers.map((t) => TIER_INFO[t].name).join(" + ")}
                  {p.interval ? ` · ${p.interval === "year" ? "yearly" : "monthly"}` : ""}
                  {p.periodEnd ? ` · ${live ? "renews" : "ended"} ${fmtDate(p.periodEnd)}` : ""}
                </p>
                <p className={`text-xs mt-1 ${here ? "text-emerald-400" : "text-slate-500"}`}>
                  {!live ? `Not active (${p.status.replace("_", " ")})` : here ? "✓ On this server" : p.guildId ? `On ${p.guildName}` : "Not on a server yet"}
                </p>
              </div>
              {live && !here && (
                <button type="button" className="neon-button-sm" disabled={busy === p.entitlementId} onClick={() => place(p)}>
                  {p.guildId ? "Move it here" : "Put it on this server"}
                </button>
              )}
              {p.guildId && (
                <button type="button" className="text-xs text-slate-400 hover:text-rose-300" disabled={busy === p.entitlementId} onClick={() => remove(p)}>
                  Take off
                </button>
              )}
            </div>
          );
        })}
        {store && (
          <div className="flex flex-wrap gap-2 pt-1">
            {(["pro", "kit", "deck"] as PlanTier[]).map((t) => (
              <a key={t} href={`${store}/p/${TIER_INFO[t].product}`} target="_blank" rel="noreferrer" className="neon-button-sm">
                {TIER_INFO[t].icon} Get {TIER_INFO[t].name}
              </a>
            ))}
            <a href={`${store}/p/all-access`} target="_blank" rel="noreferrer" className="neon-button-sm">
              💎 Get All Access
            </a>
            <a href={`${store}/library`} target="_blank" rel="noreferrer" className="text-xs text-slate-400 underline self-center">
              Billing and receipts
            </a>
          </div>
        )}
      </NeonCard>

      {mine?.owner && (
        <NeonCard className="space-y-3">
          <h2 className="font-semibold">🔑 Give this server a free plan</h2>
          <p className="text-xs text-slate-500">Only you see this. Use it for friends, partners or giveaway winners. It stays until you switch it off.</p>
          {PLAN_TIERS.map((t) => (
            <label key={t} className="flex items-center justify-between gap-3 text-sm">
              <span>
                {TIER_INFO[t].icon} {TIER_INFO[t].name}
              </span>
              <ToggleSwitch enabled={gift.includes(t)} onChange={(on) => toggleGift(t, on)} label={`Free ${TIER_INFO[t].name}`} />
            </label>
          ))}
        </NeonCard>
      )}
    </div>
  );
}
