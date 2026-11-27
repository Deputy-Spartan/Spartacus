"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { KD_ANIMS, KD_COLOR_MODES, KD_DEFAULTS, KD_DTEXTS, KD_LAYOUTS, KD_SOUNDS, KD_STREAKS, kdRatio, type CounterLook } from "@spartacus/shared";
import { NeonCard } from "../../../../../components/ui/NeonCard";
import { useConfirm } from "../../../../../components/ui/ConfirmDialog";
import { PageGuideButton } from "../../../../../components/nav/PageGuideButton";
import { ShowOnStream } from "../../../../../components/streaming/ShowOnStream";
import { AnimChoices, Choices, ColorChoices, CommonLook, CounterPreview, ObsCard, Toggle, button, demoIn, field, hint } from "../../../../../components/streaming/CounterParts";
import { useAutoSave } from "../../../../../lib/useAutoSave";
import { api, type KdCounterSettings } from "../../../../../lib/api";

type Look = Omit<KdCounterSettings, "kills" | "deaths" | "streak">;
type Nums = Pick<KdCounterSettings, "kills" | "deaths" | "streak">;

// Streaming › K/D Counter: KILLS / DEATHS on stream, changed with Stream Deck
// keys or this page. Same looks and animations as the Money Counter.
export default function KdCounterPage({ params }: { params: { guildId: string } }) {
  const guildId = params.guildId;
  const confirm = useConfirm();
  const [look, setLook] = useState<Look | null>(null);
  const [nums, setNums] = useState<Nums>({ kills: 0, deaths: 0, streak: 0 });
  const [start, setStart] = useState<Nums>({ kills: 0, deaths: 0, streak: 0 });
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const frame = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    api
      .getKdCounter(guildId)
      .then(({ kills, deaths, streak, ...rest }) => {
        setNums({ kills, deaths, streak });
        setStart({ kills, deaths, streak });
        setLook(rest);
      })
      .catch(() => setFailed(true));
  }, [guildId]);

  // Stream Deck presses change it too, so keep this page in step.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.hidden) return;
      api
        .getKdCounter(guildId)
        .then(({ kills, deaths, streak }) => setNums((n) => (n.kills === kills && n.deaths === deaths && n.streak === streak ? n : { kills, deaths, streak })))
        .catch(() => null);
    }, 3000);
    return () => clearInterval(t);
  }, [guildId]);

  const autoSave = useAutoSave(look, async () => {
    if (look) await api.saveKdCounter(guildId, { ...look, ...nums });
  });

  if (failed) return <p className="text-rose-300">Couldn&apos;t load the K/D counter. Refresh the page to try again.</p>;
  if (!look) return <p className="text-slate-400">Loading…</p>;

  const update = (patch: Partial<Look>) => setLook({ ...look, ...patch });
  const demo = (key: "kills" | "deaths", diff: number) => demoIn(frame.current, key, diff);
  const pick = (patch: Partial<CounterLook> | Partial<Look>, key: "kills" | "deaths" = "kills") => {
    update(patch as Partial<Look>);
    setTimeout(() => demo(key, 1), 200);
  };

  async function change(c: { stat: "kills" | "deaths"; add: number } | { stat: "both"; set: number }) {
    setBusy(true);
    setErr("");
    try {
      const r = await api.changeKd(guildId, c);
      setNums({ kills: r.kills, deaths: r.deaths, streak: r.streak });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't change it. Try again.");
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    if (!(await confirm("Set kills and deaths back to 0?", { title: "Reset", confirmLabel: "Reset", danger: true }))) return;
    await change({ stat: "both", set: 0 });
  }
  const { kills: _k, deaths: _d, streak: _s, ...defaults } = KD_DEFAULTS;
  const changed = (Object.keys(defaults) as Array<keyof Look>).some((k) => look[k] !== defaults[k]);

  const Stepper = ({ stat, name, color }: { stat: "kills" | "deaths"; name: string; color: string }) => (
    <div className="rounded-lg border border-white/10 p-3 text-center">
      <p className="text-xs uppercase tracking-wide text-slate-400">{name}</p>
      <p className="text-4xl font-extrabold tabular-nums my-1" style={{ color }}>
        {nums[stat]}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button className={button} disabled={busy || nums[stat] === 0} onClick={() => change({ stat, add: -1 })} aria-label={`Take away 1 ${name}`}>
          −1
        </button>
        <button className="neon-button" disabled={busy} onClick={() => change({ stat, add: 1 })} aria-label={`Add 1 ${name}`}>
          +1
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">🎯 K/D Counter</h1>
          <p className="text-slate-400 text-sm mt-1">Kills and deaths on stream. Change them here or with Stream Deck buttons.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ShowOnStream guildId={guildId} id="kd" />
          <PageGuideButton guildId={guildId} inline />
        </div>
      </div>

      <CounterPreview
        kind="kd"
        start={{ kills: String(start.kills), deaths: String(start.deaths) }}
        settings={look}
        values={nums}
        status={autoSave}
        frameRef={frame}
        onCanvas={(canvasW, canvasH) => update({ canvasW, canvasH })}
        tryBar={
          <div className="flex flex-wrap gap-2 mt-3">
            <button className={button} onClick={() => demo("kills", 1)}>
              ▶ Try <span className="text-emerald-300">+1 kill</span>
            </button>
            <button className={button} onClick={() => demo("deaths", 1)}>
              ▶ Try <span className="text-rose-300">+1 death</span>
            </button>
            <button className={button} onClick={() => frame.current?.contentWindow?.postMessage({ type: "counter-streak" }, window.location.origin)}>
              ▶ Try a kill streak
            </button>
          </div>
        }
        after={
          <>
            <ObsCard path={`/overlay/kd/${guildId}`} w={look.canvasW} h={look.canvasH} />
            <NeonCard>
              <p className="font-medium">🎛️ Stream Deck</p>
              <p className={`${hint} mb-3`}>
                Needs the Spartacus plugin, version 1.3 or newer. Get it on the{" "}
                <Link href={`/dashboard/${guildId}/stream-deck`} className="text-neon-blue underline">
                  Stream Deck page
                </Link>
                .
              </p>
              <ol className="list-decimal pl-5 space-y-1 text-sm text-slate-300">
                <li>In the Stream Deck app, drag Spartacus → 🎯 Kill / Death onto a key.</li>
                <li>Pick Kills or Deaths and type the Amount (1 for most keys, -1 to take one away).</li>
                <li>For a reset key: pick Both, type 0 and pick Set it to the amount.</li>
                <li>Make one key for each: +1 kill, +1 death, and a reset.</li>
              </ol>
              <p className={`${hint} mt-3`}>On a Stream Deck +, the 🎯 Kill / Death Dial adds or takes away kills as you turn it, and adds a death when you press it.</p>
            </NeonCard>
          </>
        }
        before={
        <NeonCard>
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="font-medium">🎯 This session</p>
            <button className={`${button} text-rose-300`} disabled={busy || (nums.kills === 0 && nums.deaths === 0)} onClick={reset}>
              Reset to 0
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Stepper stat="kills" name="Kills" color="#4ade80" />
            <Stepper stat="deaths" name="Deaths" color="#f87171" />
          </div>
          <p className="text-sm text-slate-300 mt-3">
            K/D <b className="tabular-nums">{kdRatio(nums.kills, nums.deaths)}</b>
            {nums.streak > 0 && <span className="ml-3">🔥 {nums.streak} kills without dying</span>}
          </p>
          {err && <p className="text-sm text-rose-300 mt-2">{err}</p>}
          <p className={`${hint} mt-2`}>The stream shows the change within about a second.</p>
        </NeonCard>
        }
      >
          <AnimChoices items={KD_ANIMS} value={look.anim} onPick={(anim) => pick({ anim })} />
          <Choices title="Layout" items={KD_LAYOUTS} value={look.layout} onPick={(layout) => pick({ layout })} />
          <CommonLook look={look} pick={pick} sounds={KD_SOUNDS} colorTitle="Kills number color" />
          <ColorChoices title="Deaths number color" value={look.dcolor} onPick={(dcolor) => pick({ dcolor }, "deaths")} />
          <Choices title="+/− colors" cols={2} items={KD_COLOR_MODES} value={look.colors} onPick={(colors) => pick({ colors }, "deaths")} />
          <Choices title="+/− words" cols={2} items={KD_DTEXTS} value={look.dtext} onPick={(dtext) => pick({ dtext })} />

          <div className="grid sm:grid-cols-2 gap-2 mt-4">
            <Toggle on={look.ratio} name="Show K/D" desc="A third box with kills ÷ deaths." onChange={(ratio) => update({ ratio })} />
            <Toggle
              on={look.streakOn}
              name="Kill streak"
              desc="A big KILL STREAK banner with the gold glow. A death starts it over."
              onChange={(streakOn) => {
                update({ streakOn });
                if (streakOn) setTimeout(() => frame.current?.contentWindow?.postMessage({ type: "counter-streak" }, window.location.origin), 200);
              }}
            />
          </div>
          {look.streakOn && (
            <Choices
              title="Kill streak every"
              items={KD_STREAKS}
              value={look.streakEvery}
              onPick={(streakEvery) => {
                update({ streakEvery });
                setTimeout(() => frame.current?.contentWindow?.postMessage({ type: "counter-streak" }, window.location.origin), 200);
              }}
            />
          )}

          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            <label className="block">
              <span className="text-sm">Kills word</span>
              <input className={`${field} mt-1`} value={look.killsLabel} maxLength={24} placeholder="Leave empty for none" onChange={(e) => update({ killsLabel: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-sm">Deaths word</span>
              <input className={`${field} mt-1`} value={look.deathsLabel} maxLength={24} placeholder="Leave empty for none" onChange={(e) => update({ deathsLabel: e.target.value })} />
            </label>
            {look.ratio && (
              <label className="block">
                <span className="text-sm">K/D word</span>
                <input className={`${field} mt-1`} value={look.ratioLabel} maxLength={24} placeholder="Leave empty for none" onChange={(e) => update({ ratioLabel: e.target.value })} />
              </label>
            )}
            <label className="block">
              <span className="text-sm">Size: {look.size}%</span>
              <input type="range" className="w-full mt-3" min={30} max={250} step={5} value={look.size} onChange={(e) => update({ size: Number(e.target.value) })} />
            </label>
          </div>
          {changed && (
            <button className={`${button} mt-3`} onClick={() => update(defaults)}>
              Back to the default look
            </button>
          )}
      </CounterPreview>
    </div>
  );
}
