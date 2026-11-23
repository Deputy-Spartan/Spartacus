"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MONEY_ANIMS, MONEY_DEFAULTS, MONEY_LAYOUTS, MONEY_SOUNDS, formatMoney, type CounterLook } from "@spartacus/shared";
import { NeonCard } from "../../../../../components/ui/NeonCard";
import { useConfirm } from "../../../../../components/ui/ConfirmDialog";
import { PageGuideButton } from "../../../../../components/nav/PageGuideButton";
import { ShowOnStream } from "../../../../../components/streaming/ShowOnStream";
import { AnimChoices, Choices, CommonLook, CounterPreview, ObsCard, Toggle, button, demoIn, field, hint } from "../../../../../components/streaming/CounterParts";
import { useAutoSave } from "../../../../../lib/useAutoSave";
import { api, type MoneyCounterSettings } from "../../../../../lib/api";

type Look = Omit<MoneyCounterSettings, "amount">;

// Streaming › Money Counter: a TOTAL MONEY box on stream that Stream Deck keys
// (or this page) add to.
export default function MoneyCounterPage({ params }: { params: { guildId: string } }) {
  const guildId = params.guildId;
  const confirm = useConfirm();
  const [look, setLook] = useState<Look | null>(null);
  const [amount, setAmount] = useState(0);
  const [start, setStart] = useState(0);
  const [failed, setFailed] = useState(false);
  const [entry, setEntry] = useState("100000");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const frame = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    api
      .getMoneyCounter(guildId)
      .then(({ amount: a, ...rest }) => {
        setAmount(a);
        setStart(a);
        setLook(rest);
      })
      .catch(() => setFailed(true));
  }, [guildId]);

  // Stream Deck presses change it too, so keep this page in step.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.hidden) return;
      api
        .getMoneyCounter(guildId)
        .then((m) => setAmount(m.amount))
        .catch(() => null);
    }, 3000);
    return () => clearInterval(t);
  }, [guildId]);

  const autoSave = useAutoSave(look, async () => {
    if (look) await api.saveMoneyCounter(guildId, { ...look, amount });
  });

  if (failed) return <p className="text-rose-300">Couldn&apos;t load the money counter. Refresh the page to try again.</p>;
  if (!look) return <p className="text-slate-400">Loading…</p>;

  const update = (patch: Partial<Look>) => setLook({ ...look, ...patch });
  const demo = (diff: number) => demoIn(frame.current, "amount", diff);
  // Picking an option plays it once so you can see it.
  const pick = (patch: Partial<CounterLook> | Partial<Look>) => {
    update(patch as Partial<Look>);
    setTimeout(() => demo(100000), 200);
  };
  const typed = Number(entry.replace(/[^0-9-]/g, ""));
  const valid = entry.replace(/[^0-9-]/g, "") !== "" && Number.isFinite(typed);

  async function change(c: { add: number } | { set: number }) {
    setBusy(true);
    setErr("");
    try {
      setAmount((await api.changeMoney(guildId, c)).amount);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't change it. Try again.");
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    if (!(await confirm("Set the money counter back to 0?", { title: "Reset to 0", confirmLabel: "Reset", danger: true }))) return;
    await change({ set: 0 });
  }
  const { amount: _a, ...defaults } = MONEY_DEFAULTS;
  const changed = (Object.keys(defaults) as Array<keyof Look>).some((k) => look[k] !== defaults[k]);

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">💰 Money Counter</h1>
          <p className="text-slate-400 text-sm mt-1">A money total on stream. Change it here or with a Stream Deck button.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ShowOnStream guildId={guildId} id="money" />
          <PageGuideButton guildId={guildId} inline />
        </div>
      </div>

      <div className="space-y-4">
        <NeonCard>
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium">💵 Total</p>
            <button className={`${button} text-rose-300`} disabled={busy || amount === 0} onClick={reset}>
              Reset to 0
            </button>
          </div>
          <p className="text-4xl sm:text-5xl font-extrabold text-[#f9c933] my-3 break-all tabular-nums">{formatMoney(amount, look.prefix, look.suffix)}</p>
          <label className="block">
            <span className="text-sm">Amount</span>
            <input className={`${field} mt-1 text-base`} inputMode="numeric" value={entry} maxLength={16} onChange={(e) => setEntry(e.target.value)} placeholder="100000" />
          </label>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <button className="neon-button" disabled={busy || !valid} onClick={() => change({ add: Math.abs(typed) })}>
              + Add
            </button>
            <button className={button} disabled={busy || !valid} onClick={() => change({ add: -Math.abs(typed) })}>
              − Take away
            </button>
            <button className={button} disabled={busy || !valid} onClick={() => change({ set: typed })}>
              Set to this
            </button>
          </div>
          {err && <p className="text-sm text-rose-300 mt-2">{err}</p>}
          <p className={`${hint} mt-2`}>The stream shows the change within about a second.</p>
        </NeonCard>

        <CounterPreview kind="money" start={{ amount: String(start) }} settings={look} values={{ amount }} status={autoSave} frameRef={frame}>
          <div className="flex flex-wrap gap-2 mt-3">
            <button className={button} onClick={() => demo(100000)}>
              ▶ Try <span className="text-emerald-300">+ add</span>
            </button>
            <button className={button} onClick={() => demo(-100000)}>
              ▶ Try <span className="text-rose-300">− take away</span>
            </button>
            <span className={`${hint} self-center`}>Only plays here. Your total doesn&apos;t change.</span>
          </div>

          <AnimChoices items={MONEY_ANIMS} value={look.anim} onPick={(anim) => pick({ anim })} />
          <Choices title="Layout" cols={2} items={MONEY_LAYOUTS} value={look.layout} onPick={(layout) => pick({ layout })} />
          <CommonLook look={look} pick={pick} sounds={MONEY_SOUNDS} />

          <div className="grid sm:grid-cols-2 gap-2 mt-4">
            <Toggle
              on={look.bigwin}
              name="Big win celebration"
              desc="Adding 1,000,000 or more also gets the gold glow and sparkles."
              onChange={(bigwin) => {
                update({ bigwin });
                if (bigwin) setTimeout(() => demo(1000000), 200);
              }}
            />
            <Toggle on={look.short} name="Short numbers" desc="Shows $7.3M instead of $7,300,000." onChange={(short) => update({ short })} />
          </div>

          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            <label className="block">
              <span className="text-sm">Words on top</span>
              <input className={`${field} mt-1`} value={look.label} maxLength={40} placeholder="Leave empty for none" onChange={(e) => update({ label: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-sm">Size: {look.size}%</span>
              <input type="range" className="w-full mt-3" min={30} max={250} step={5} value={look.size} onChange={(e) => update({ size: Number(e.target.value) })} />
            </label>
            <label className="block">
              <span className="text-sm">Before the number</span>
              <input className={`${field} mt-1`} value={look.prefix} maxLength={6} placeholder="e.g. $" onChange={(e) => update({ prefix: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-sm">After the number</span>
              <input className={`${field} mt-1`} value={look.suffix} maxLength={12} placeholder="e.g.  coins" onChange={(e) => update({ suffix: e.target.value })} />
            </label>
          </div>
          {changed && (
            <button className={`${button} mt-3`} onClick={() => update(defaults)}>
              Back to the default look
            </button>
          )}
        </CounterPreview>

        <ObsCard path={`/overlay/money/${guildId}`} />

        <NeonCard>
          <p className="font-medium">🎛️ Stream Deck</p>
          <p className={`${hint} mb-3`}>
            Needs the Spartacus plugin, version 1.2 or newer. Get it on the{" "}
            <Link href={`/dashboard/${guildId}/stream-deck`} className="text-neon-blue underline">
              Stream Deck page
            </Link>
            .
          </p>
          <ol className="list-decimal pl-5 space-y-1 text-sm text-slate-300">
            <li>In the Stream Deck app, drag Spartacus → 💰 Money Counter onto a key.</li>
            <li>Type the Amount, like 100000. Use a minus, like -100000, to take money away.</li>
            <li>Pick Add the amount, or Set it to the amount (an amount of 0 makes a reset key).</li>
            <li>Make one key for each amount you use.</li>
          </ol>
          <p className={`${hint} mt-3`}>On a Stream Deck +, the 💰 Money Dial adds or takes away the amount with each click. Press it twice to reset to 0.</p>
        </NeonCard>
      </div>
    </div>
  );
}
