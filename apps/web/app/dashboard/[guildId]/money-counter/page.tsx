"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MONEY_ANIMS, MONEY_DEFAULTS, MONEY_SPOTS, formatMoney } from "@spartacus/shared";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { SaveStatus } from "../../../../components/ui/SaveStatus";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { PageGuideButton } from "../../../../components/nav/PageGuideButton";
import { useAutoSave } from "../../../../lib/useAutoSave";
import { api, type MoneyCounterSettings } from "../../../../lib/api";

const field = "w-full min-w-0 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm";
const hint = "text-xs text-slate-500";
const button = "text-sm px-3 py-2 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:border-white/30 transition-colors disabled:opacity-40";

// The overlay canvas size to set in OBS. The box sits in the middle, with room
// around it for the +$ / -$ amount.
const OBS_W = 1400;
const OBS_H = 500;

type Look = Omit<MoneyCounterSettings, "amount">;

// Streaming › Money Counter: a TOTAL MONEY box on stream that Stream Deck keys
// (or this page) add to.
export default function MoneyCounterPage({ params }: { params: { guildId: string } }) {
  const guildId = params.guildId;
  const confirm = useConfirm();
  const [look, setLook] = useState<Look | null>(null);
  const [amount, setAmount] = useState(0);
  const [failed, setFailed] = useState(false);
  const [entry, setEntry] = useState("100000");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(0.5);
  const [src, setSrc] = useState("");

  useEffect(() => {
    api
      .getMoneyCounter(guildId)
      .then((m) => {
        const { amount: a, ...rest } = m;
        setAmount(a);
        setLook(rest);
        // Starts with the saved look; later changes are sent to it so they animate.
        setSrc(`/overlays/money.html?${new URLSearchParams({ preview: "1", amount: String(a), label: rest.label, prefix: rest.prefix, suffix: rest.suffix, size: String(rest.size), anim: rest.anim, spot: rest.spot })}`);
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

  // Keep the preview fitted to its box.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / OBS_W);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [look === null]);

  // Send every change to the preview, so the number rolls like it does on stream.
  useEffect(() => {
    if (look) frame.current?.contentWindow?.postMessage({ type: "money", value: { ...look, amount } }, window.location.origin);
  }, [look, amount]);

  if (failed) return <p className="text-rose-300">Couldn&apos;t load the money counter. Refresh the page to try again.</p>;
  if (!look) return <p className="text-slate-400">Loading…</p>;

  const update = (patch: Partial<Look>) => setLook({ ...look, ...patch });
  // Plays the animation in the preview with a pretend amount.
  const demo = (diff: number) => frame.current?.contentWindow?.postMessage({ type: "money-demo", diff }, window.location.origin);
  // Picking an animation or spot plays it once so you can see it.
  const pick = (patch: Partial<Look>) => {
    update(patch);
    setTimeout(() => demo(100000), 200);
  };
  const typed = Number(entry.replace(/[^0-9-]/g, ""));
  const valid = entry.replace(/[^0-9-]/g, "") !== "" && Number.isFinite(typed);
  const obsLink = typeof window !== "undefined" ? `${window.location.origin}/overlay/money/${guildId}` : "";

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

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">💰 Money Counter</h1>
          <p className="text-slate-400 text-sm mt-1">A money total on stream. Change it here or with a Stream Deck button.</p>
        </div>
        <PageGuideButton guildId={guildId} inline />
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

        <NeonCard>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <p className="font-medium">👀 Preview</p>
              <p className={hint}>The checkered part is see-through on stream.</p>
            </div>
            <SaveStatus status={autoSave} />
          </div>
          <div ref={box} className="relative overflow-hidden rounded-lg border border-white/10 bg-black w-full" style={{ aspectRatio: `${OBS_W} / ${OBS_H}` }}>
            {src && (
              <iframe
                ref={frame}
                src={src}
                title="Money counter preview"
                className="absolute left-0 top-0 border-0 pointer-events-none"
                style={{ width: OBS_W, height: OBS_H, transform: `scale(${scale})`, transformOrigin: "0 0" }}
              />
            )}
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <button className={button} onClick={() => demo(100000)}>
              ▶ Try <span className="text-emerald-300">+ add</span>
            </button>
            <button className={button} onClick={() => demo(-100000)}>
              ▶ Try <span className="text-rose-300">− take away</span>
            </button>
            <span className={`${hint} self-center`}>Only plays here. Your total doesn&apos;t change.</span>
          </div>

          <p className="text-sm mt-4 mb-1.5">Animation</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {MONEY_ANIMS.map(([id, name, desc]) => (
              <button
                key={id}
                type="button"
                onClick={() => pick({ anim: id })}
                aria-pressed={look.anim === id}
                className={`text-left rounded-lg border p-2.5 transition-colors ${look.anim === id ? "border-neon-blue bg-neon-blue/10" : "border-white/10 hover:border-white/25"}`}
              >
                <p className="font-semibold text-sm">
                  {name} {look.anim === id && <span className="text-neon-blue">✓</span>}
                </p>
                <p className={hint}>{desc}</p>
              </button>
            ))}
          </div>

          <p className="text-sm mt-4 mb-1.5">
            Where the <span className="text-emerald-300">+$</span> / <span className="text-rose-300">−$</span> shows
          </p>
          <div className="grid grid-cols-3 gap-2">
            {MONEY_SPOTS.map(([id, name]) => (
              <button
                key={id}
                type="button"
                onClick={() => pick({ spot: id })}
                aria-pressed={look.spot === id}
                className={`text-sm rounded-lg border px-2 py-2 transition-colors ${look.spot === id ? "border-neon-blue bg-neon-blue/10 text-white font-semibold" : "border-white/10 text-slate-300 hover:border-white/25"}`}
              >
                {name}
              </button>
            ))}
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
          {(look.label !== MONEY_DEFAULTS.label || look.prefix !== MONEY_DEFAULTS.prefix || look.suffix || look.size !== 100) && (
            <button className={`${button} mt-3`} onClick={() => update({ label: MONEY_DEFAULTS.label, prefix: MONEY_DEFAULTS.prefix, suffix: "", size: 100 })}>
              Back to the default look
            </button>
          )}
        </NeonCard>

        <NeonCard>
          <p className="font-medium">🎥 Add it to OBS</p>
          <p className={`${hint} mb-3`}>One link. It keeps working when you change anything here.</p>
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <input className={`${field} font-mono text-xs`} value={obsLink} readOnly onFocus={(e) => e.target.select()} aria-label="OBS link" />
            <button
              className={`${button} shrink-0`}
              onClick={() =>
                navigator.clipboard
                  .writeText(obsLink)
                  .then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  })
                  .catch(() => null)
              }
            >
              {copied ? "Copied ✓" : "Copy link"}
            </button>
          </div>
          <ol className="list-decimal pl-5 space-y-1 text-sm text-slate-300">
            <li>In OBS: Sources → + → Browser.</li>
            <li>Untick Local file and paste the link into URL.</li>
            <li>
              Set Width {OBS_W} and Height {OBS_H}.
            </li>
            <li>Drag it where you want it. The box is in the middle, with room around it for the +$ / −$. Bigger? Use the Size slider here, not OBS, so it stays sharp.</li>
          </ol>
        </NeonCard>

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
