"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  MESSAGE_EVERY,
  MESSAGE_EXTRAS,
  MESSAGE_PRESETS,
  messageStep,
  messageText,
  OVERLAYS,
  OVERLAY_ICONS,
  OVERLAY_VALUE_KEYS,
  TIMER_LENGTHS,
  WIN_STREAKS,
  formatClock,
  timerNow,
  type CounterLook,
  type OverlayKind,
  type OverlayState,
  type TimerValue,
} from "@spartacus/shared";
import { NeonCard } from "../ui/NeonCard";
import { useConfirm } from "../ui/ConfirmDialog";
import { PageGuideButton } from "../nav/PageGuideButton";
import { ShowOnStream } from "./ShowOnStream";
import { AnimChoices, Choices, ColorChoices, CommonLook, CounterPreview, ObsCard, Toggle, button, demoIn, field, hint } from "./CounterParts";
import { useAutoSave } from "../../lib/useAutoSave";
import { api } from "../../lib/api";

// Streaming › Overlays: one page for each of Game, Win/Loss, Timer, Goal bar,
// Challenge, Discord box and Latest follower. The top card changes the
// numbers; the preview card holds the look (saved by itself).

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
type Vals = Record<string, unknown>;

function splitState(kind: OverlayKind, st: OverlayState): [OverlayState, Vals] {
  const look = { ...st };
  const vals: Vals = {};
  for (const k of OVERLAY_VALUE_KEYS[kind]) {
    vals[k] = st[k];
    delete look[k];
  }
  return [look, vals];
}

// What the preview's "Try it" plays, and which stat it's on.
const DEMO: Record<OverlayKind, [string, number]> = {
  game: ["game", 1],
  message: ["message", 1],
  winloss: ["wins", 1],
  timer: ["timer", 300000],
  goal: ["goal", 1],
  challenge: ["count", 1],
  discord: ["discord", 1],
  ticker: ["ticker", 1],
};

export function OverlayEditor({ guildId, kind }: { guildId: string; kind: OverlayKind }) {
  const info = OVERLAYS[kind];
  const confirm = useConfirm();
  const [look, setLook] = useState<OverlayState | null>(null);
  const [vals, setVals] = useState<Vals>({});
  const [live, setLive] = useState<{ members: number; online: number; invite: string }>({ members: 0, online: 0, invite: "" });
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [text, setText] = useState("");
  const [tickType, setTickType] = useState("follow");
  const [draft, setDraft] = useState<string | null>(null); // message list being typed
  const [, setTick] = useState(0);
  const frame = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    api
      .getOverlay(guildId, kind)
      .then((st) => {
        const [l, v] = splitState(kind, st);
        setLook(l);
        setVals(v);
      })
      .catch(() => setFailed(true));
  }, [guildId, kind]);

  // Stream Deck presses (and Kick follows) change it too, so keep in step.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.hidden) return;
      api
        .getOverlay(guildId, kind)
        .then((st) => {
          const [, v] = splitState(kind, st);
          setVals((cur) => (JSON.stringify(cur) === JSON.stringify(v) ? cur : v));
        })
        .catch(() => null);
      if (kind === "discord")
        fetch(`${API_URL}/public/overlay/discord/${guildId}`, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((r) => r && setLive({ members: Number(r.members) || 0, online: Number(r.online) || 0, invite: String(r.invite ?? "") }))
          .catch(() => null);
    }, kind === "discord" ? 15000 : 3000);
    return () => clearInterval(t);
  }, [guildId, kind]);

  // The timer card counts by itself, and a cycling message box moves on by itself.
  useEffect(() => {
    if (kind !== "timer" && kind !== "message") return;
    const t = setInterval(() => setTick((n) => n + 1), kind === "timer" ? 250 : 1000);
    return () => clearInterval(t);
  }, [kind]);
  useEffect(() => {
    if (kind === "discord")
      fetch(`${API_URL}/public/overlay/discord/${guildId}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((r) => r && setLive({ members: Number(r.members) || 0, online: Number(r.online) || 0, invite: String(r.invite ?? "") }))
        .catch(() => null);
  }, [guildId, kind]);

  const autoSave = useAutoSave(look, async () => {
    if (look) await api.saveOverlay(guildId, kind, { ...look, ...vals } as OverlayState);
  });

  if (failed) return <p className="text-rose-300">Couldn&apos;t load this overlay. Refresh the page to try again.</p>;
  if (!look) return <p className="text-slate-400">Loading…</p>;

  const update = (patch: Partial<OverlayState>) => setLook({ ...look, ...patch } as OverlayState);
  const demo = (key = DEMO[kind][0], diff = DEMO[kind][1]) => demoIn(frame.current, key, diff);
  const pick = (patch: Partial<CounterLook> | Partial<OverlayState>, key?: string) => {
    update(patch as Partial<OverlayState>);
    setTimeout(() => demo(key), 200);
  };
  const str = (k: string) => String(look[k] ?? "");
  const n = (k: string) => Number(vals[k]) || 0;

  async function act(a: Record<string, unknown>) {
    setBusy(true);
    setErr("");
    try {
      const st = await api.overlayAction(guildId, kind, a);
      setVals(splitState(kind, st)[1]);
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't change it. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const askReset = async (msg: string, a: Record<string, unknown>) => {
    if (await confirm(msg, { title: "Reset", confirmLabel: "Reset", danger: true })) await act(a);
  };

  // What the preview shows: the look, plus the numbers (and the live Discord counts).
  const previewValues: Vals = kind === "goal" ? { ...vals, target: look.target } : kind === "discord" ? { members: live.members, online: live.online } : vals;
  const previewLook = kind === "discord" && !str("invite") ? { ...look, invite: live.invite || "discord.gg/yourcode" } : look;
  const { ...defaults } = info.defaults;
  for (const k of OVERLAY_VALUE_KEYS[kind]) delete (defaults as Vals)[k];
  const changed = Object.keys(defaults).some((k) => JSON.stringify(look[k]) !== JSON.stringify((defaults as Vals)[k]));

  const pairStepper = (stat: string, name: string, color: string) => (
    <div className="rounded-lg border border-white/10 p-3 text-center">
      <p className="text-xs uppercase tracking-wide text-slate-400">{name}</p>
      <p className="text-4xl font-extrabold tabular-nums my-1" style={{ color }}>
        {n(stat)}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button className={button} disabled={busy || n(stat) === 0} onClick={() => act({ stat, add: -1 })} aria-label={`Take away 1 from ${name}`}>
          −1
        </button>
        <button className="neon-button" disabled={busy} onClick={() => act({ stat, add: 1 })} aria-label={`Add 1 to ${name}`}>
          +1
        </button>
      </div>
    </div>
  );

  // ---- The top card: change what's on stream ----
  let controls: ReactNode = null;
  if (kind === "game") {
    const recent = (vals.recentGames as string[]) ?? [];
    controls = (
      <>
        <p className="text-sm text-slate-400">On stream now</p>
        <p className="text-3xl font-extrabold text-[#f9c933] my-1 break-words">{String(vals.game || "—")}</p>
        <form
          className="flex gap-2 mt-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (text.trim() && (await act({ game: text.trim() }))) setText("");
          }}
        >
          <input className={field} value={text} maxLength={60} placeholder="Type a game" onChange={(e) => setText(e.target.value)} aria-label="Game" />
          <button className="neon-button shrink-0" disabled={busy || !text.trim()}>
            Show it
          </button>
        </form>
        {recent.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            <span className={`${hint} self-center`}>Recent:</span>
            {recent.map((g) => (
              <button key={g} className={button} disabled={busy} onClick={() => act({ game: g })}>
                {g}
              </button>
            ))}
          </div>
        )}
      </>
    );
  } else if (kind === "message") {
    const list = (look.msgs as string[]) ?? [];
    const say = String(vals.say || "");
    const cycling = !!vals.cycle;
    const at = list.length ? (n("idx") + messageStep({ ...look, ...vals })) % list.length : 0;
    controls = (
      <>
        <p className="text-sm text-slate-400">On stream now</p>
        <p className="text-3xl font-extrabold text-[#f9c933] my-1 break-words">{messageText({ ...look, ...vals }) || "—"}</p>
        {cycling && (
          <p className={hint}>
            🔁 Cycling every {String(look.every)} seconds{say ? ". Paused while your typed message shows." : "."}
          </p>
        )}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3">
          <button className={button} disabled={busy} onClick={() => act({ op: "prev" })}>
            ⏮ Last
          </button>
          <button className="neon-button" disabled={busy} onClick={() => act({ op: "next" })}>
            ⏭ Next
          </button>
          <button className={button} disabled={busy} onClick={() => act({ op: "again" })}>
            🔁 Replay
          </button>
          <button className={button} disabled={busy || n("need") === 0} onClick={() => act({ op: "minus" })} aria-label="Need 1 less">
            ➖ 1
          </button>
          <button className={button} disabled={busy} onClick={() => act({ op: "plus" })} aria-label="Need 1 more">
            ➕ 1
          </button>
          <button className={button} disabled={busy} onClick={() => act({ op: "full" })}>
            ✅ Full
          </button>
        </div>
        <p className="text-sm text-slate-300 mt-2">
          The number in {"{n}"} is <b className="tabular-nums">{n("need")}</b>. At 0 it shows &ldquo;{str("fullText")}&rdquo;.
        </p>
        {list.length > 1 && (
          <div className="flex flex-wrap gap-2 mt-3">
            <span className={`${hint} self-center`}>Jump to:</span>
            {list.map((m, i) => (
              <button key={`${i}-${m}`} className={`${button} ${!say && at === i ? "!border-neon-blue text-white" : ""}`} disabled={busy} onClick={() => act({ op: "go", to: i })}>
                {m.split("{n}").join(String(n("need")))}
              </button>
            ))}
          </div>
        )}
        <form
          className="flex gap-2 mt-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (text.trim() && (await act({ op: "say", text: text.trim() }))) setText("");
          }}
        >
          <input className={field} value={text} maxLength={60} placeholder="Type a one-off message" onChange={(e) => setText(e.target.value)} aria-label="One-off message" />
          <button className="neon-button shrink-0" disabled={busy || !text.trim()}>
            Show it
          </button>
        </form>
        {say && (
          <button className={`${button} mt-2`} disabled={busy} onClick={() => act({ op: "clear" })}>
            ↩ Back to my list
          </button>
        )}
        <div className="mt-3">
          <Toggle on={cycling} name="Cycle through all messages" desc="Steps through every message in your list by itself." onChange={(on) => act({ op: "cycle", on })} />
        </div>
        <Choices title="Next message every" cols={3} items={MESSAGE_EVERY} value={Number(look.every)} onPick={(every) => update({ every })} />
      </>
    );
  } else if (kind === "winloss") {
    const w = n("wins"), l = n("losses");
    controls = (
      <>
        <div className="grid grid-cols-2 gap-3">
          {pairStepper("wins", "Wins", "#4ade80")}
          {pairStepper("losses", "Losses", "#f87171")}
        </div>
        <p className="text-sm text-slate-300 mt-3">
          Win % <b className="tabular-nums">{w + l ? Math.round((w / (w + l)) * 100) : 0}%</b>
          {n("streak") > 0 && <span className="ml-3">🏆 {n("streak")} wins in a row</span>}
        </p>
        <button className={`${button} text-rose-300 mt-3`} disabled={busy || (w === 0 && l === 0)} onClick={() => askReset("Set wins and losses back to 0?", { stat: "both", set: 0 })}>
          Reset to 0
        </button>
      </>
    );
  } else if (kind === "timer") {
    const tv = vals.timer as TimerValue;
    const st = { ...look, timer: tv } as OverlayState;
    const up = look.timerMode === "up";
    controls = (
      <>
        <p className="text-5xl font-extrabold tabular-nums text-white my-2">{formatClock(timerNow(st), up)}</p>
        <p className={hint}>{tv?.running ? "Running" : "Paused"} · {up ? "Counting up" : "Counting down"}</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
          <button className="neon-button" disabled={busy} onClick={() => act({ op: "toggle" })}>
            {tv?.running ? "⏸ Pause" : "▶ Start"}
          </button>
          <button className={button} disabled={busy} onClick={() => act({ op: "add", ms: 60000 })}>
            +1 min
          </button>
          <button className={button} disabled={busy} onClick={() => act({ op: "add", ms: 300000 })}>
            +5 min
          </button>
          <button className={button} disabled={busy} onClick={() => act({ op: "add", ms: -60000 })}>
            −1 min
          </button>
          <button className={button} disabled={busy} onClick={() => act({ op: "restart" })}>
            ⟲ Restart
          </button>
        </div>
      </>
    );
  } else if (kind === "goal") {
    controls = (
      <>
        <p className="text-4xl font-extrabold tabular-nums text-[#f9c933] my-2">
          {n("cur").toLocaleString()} / {Number(look.target).toLocaleString()}
        </p>
        <div className="h-3 rounded-full bg-black/40 overflow-hidden">
          <div className="h-full bg-[#f9c933]" style={{ width: `${Math.min(100, (n("cur") / Math.max(1, Number(look.target))) * 100)}%` }} />
        </div>
        <div className="grid grid-cols-4 gap-2 mt-3">
          <button className="neon-button" disabled={busy} onClick={() => act({ add: 1 })}>
            +1
          </button>
          <button className={button} disabled={busy} onClick={() => act({ add: 10 })}>
            +10
          </button>
          <button className={button} disabled={busy || n("cur") === 0} onClick={() => act({ add: -1 })}>
            −1
          </button>
          <button className={`${button} text-rose-300`} disabled={busy || n("cur") === 0} onClick={() => askReset("Set the goal bar back to 0?", { set: 0 })}>
            Reset
          </button>
        </div>
        <label className="block mt-3">
          <span className="text-sm">Goal</span>
          <input className={`${field} mt-1`} inputMode="numeric" value={String(look.target)} onChange={(e) => update({ target: Math.max(1, Number(e.target.value.replace(/[^0-9]/g, "")) || 1) })} />
        </label>
        <div className="mt-3">
          <Toggle on={!!look.autoKick} name="Count Kick follows" desc="Each new Kick follower moves the bar by 1 (needs Kick set up in Stream Growth)." onChange={(autoKick) => update({ autoKick })} />
        </div>
      </>
    );
  } else if (kind === "challenge") {
    controls = (
      <>
        <p className="text-sm text-slate-400">{str("chLabel")}</p>
        <p className="text-5xl font-extrabold tabular-nums text-white my-1">{n("count")}</p>
        <div className="grid grid-cols-4 gap-2 mt-2">
          <button className="neon-button" disabled={busy} onClick={() => act({ add: 1 })}>
            +1
          </button>
          <button className={button} disabled={busy} onClick={() => act({ add: 5 })}>
            +5
          </button>
          <button className={button} disabled={busy || n("count") === 0} onClick={() => act({ add: -1 })}>
            −1
          </button>
          <button className={`${button} text-rose-300`} disabled={busy || n("count") === 0} onClick={() => askReset("Set the challenge back to 0?", { set: 0 })}>
            Reset
          </button>
        </div>
      </>
    );
  } else if (kind === "discord") {
    controls = (
      <>
        <p className="text-sm text-slate-300">
          👥 <b>{live.members.toLocaleString()}</b> members · 🟢 <b>{live.online.toLocaleString()}</b> online
        </p>
        <p className={`${hint} mt-1`}>These come from your server by themselves, every minute or so.</p>
        <label className="block mt-3">
          <span className="text-sm">Your invite</span>
          <input className={`${field} mt-1`} value={str("invite")} maxLength={60} placeholder={live.invite || "discord.gg/yourcode"} onChange={(e) => update({ invite: e.target.value })} />
          <span className={hint}>Leave it empty to use the Discord invite from Overlays › Socials.</span>
        </label>
      </>
    );
  } else if (kind === "ticker") {
    const recent = (vals.recent as string[]) ?? [];
    controls = (
      <>
        <p className="text-sm text-slate-400">{vals.type === "sub" ? "Latest sub" : vals.type === "raid" ? "Latest raid" : "Latest follower"}</p>
        <p className="text-3xl font-extrabold text-[#f9c933] my-1 break-words">{String(vals.name || "—")}</p>
        {recent.length > 0 && <p className={hint}>Before: {recent.join(" · ")}</p>}
        <form
          className="grid grid-cols-[1fr_auto] sm:grid-cols-[auto_1fr_auto] gap-2 mt-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (text.trim() && (await act({ type: tickType, name: text.trim() }))) setText("");
          }}
        >
          <select className={`${field} col-span-2 sm:col-span-1`} value={tickType} onChange={(e) => setTickType(e.target.value)} aria-label="What happened">
            <option value="follow">💜 Follower</option>
            <option value="sub">⭐ Sub</option>
            <option value="raid">🚀 Raid</option>
          </select>
          <input className={field} value={text} maxLength={40} placeholder="Their name" onChange={(e) => setText(e.target.value)} aria-label="Name" />
          <button className="neon-button shrink-0" disabled={busy || !text.trim()}>
            Show it
          </button>
        </form>
        <div className="mt-3">
          <Toggle on={!!look.autoKick} name="Kick follows show by themselves" desc="New Kick followers appear here (needs Kick set up in Stream Growth)." onChange={(autoKick) => update({ autoKick })} />
        </div>
      </>
    );
  }

  // ---- Settings only some have ----
  const iconChoices = kind === "game" || kind === "message" || kind === "challenge" || kind === "ticker" ? OVERLAY_ICONS[kind].map((i) => [i, i || "None"] as const) : null;
  const words: Array<[string, string, number]> =
    ({
      game: [["gameLabel", "Words on top", 30], ["sub", "Second line (optional)", 60], ["tag", "Tag words", 24]],
      message: [["msgLabel", "Words on top", 30], ["sub", "Second line (optional)", 60], ["tag", "Tag words", 24]],
      winloss: [["winsLabel", "Wins word", 24], ["lossesLabel", "Losses word", 24], ["rateLabel", "Win % word", 24]],
      timer: [["timerLabel", "Words on top", 30], ["doneText", "When it hits 0", 30]],
      goal: [["goalLabel", "Words on top", 30], ["goalDone", "When you reach it", 30]],
      challenge: [["chLabel", "What you're counting", 30]],
      discord: [["discordLabel", "Words on top", 30]],
      ticker: [["followLabel", "Follower words", 30], ["subLabel", "Sub words", 30], ["raidLabel", "Raid words", 30]],
    } as Record<OverlayKind, Array<[string, string, number]>>)[kind];
  const toggles: Array<[string, string, string]> =
    ({
      game: [["showTag", "NEW GAME tag", "A tag pops up each time the game changes."], ["uppercase", "All capitals", "Shows the name in capital letters."]],
      message: [
        ["showTag", "Pop-up tag", "Your tag words (like LFG) pop up each time the message changes."],
        ["uppercase", "All capitals", "Shows messages in capital letters. Chat commands like !discord stay as typed."],
        ["ticker", "Ticker scroll", "The message slides across the box non-stop, like a news ticker."],
      ],
      winloss: [["ratio", "Show win %", "A third box with your win rate."], ["streakOn", "Win streak", "A big WIN STREAK banner. A loss starts it over."]],
      timer: [["finalFlash", "Last 10 seconds", "The time turns red and pulses each second, then the words below show."]],
      goal: [["showPct", "Show %", "Adds how far along you are, like 82%."]],
      challenge: [["upBad", "Going up is bad", "Adding shows red and taking away shows green (for things you owe)."]],
      discord: [["showOnline", "Show who's online", "Adds the online count next to members."]],
      ticker: [["showRecent", "Show the last 3", "A line under the name with the ones before."], ["showTag", "NEW FOLLOWER tag", "A tag pops up each time."], ["uppercase", "All capitals", "Shows names in capital letters."]],
    } as Record<OverlayKind, Array<[string, string, string]>>)[kind];
  const deckNote: Record<OverlayKind, string> = {
    game: "Drag Spartacus → 🎮 Game onto a key and type the game. Make one key per game you play.",
    message: "Drag Spartacus → 🪧 Message Box onto a key and pick what it does: Next message, Last message, Need 1 more, Need 1 less, Squad full, Replay, Cycle on / off, or Show this message (type it in Message).",
    winloss: "Drag Spartacus → 🏆 Win / Loss onto a key, pick Wins or Losses and type 1. For a reset key pick Both, type 0 and Set.",
    timer: "Drag Spartacus → ⏱️ Timer onto a key and pick Start / pause, Restart, or Add minutes (type 5, or -1 to take away).",
    goal: "Drag Spartacus → 📈 Goal Bar onto a key and type how much each press moves it.",
    challenge: "Drag Spartacus → 🏋️ Challenge onto a key and type 1 (or -1 for one done).",
    discord: "Nothing to set up: the counts come from your server.",
    ticker: "Kick follows show by themselves. You can also type a name here.",
  };

  return (
    <div className="max-w-6xl">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">
            {info.icon} {info.title}
          </h1>
          <p className="text-slate-400 text-sm mt-1">{info.line}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ShowOnStream guildId={guildId} id={kind} />
          <PageGuideButton guildId={guildId} inline />
        </div>
      </div>

      <CounterPreview
        kind={kind}
        start={{}}
        settings={previewLook}
        values={previewValues}
        status={autoSave}
        frameRef={frame}
        onCanvas={(canvasW, canvasH) => update({ canvasW, canvasH })}
        tryBar={
          <div className="flex flex-wrap gap-2 mt-3">
            <button className={button} onClick={() => demo()}>
              ▶ Try it
            </button>
            {kind === "winloss" && (
              <button className={button} onClick={() => demo("losses", 1)}>
                ▶ Try a loss
              </button>
            )}
            {(kind === "winloss" || kind === "goal" || kind === "timer") && (
              <button className={button} onClick={() => frame.current?.contentWindow?.postMessage({ type: "counter-streak" }, window.location.origin)}>
                ▶ Try the banner
              </button>
            )}
            <span className={`${hint} self-center hidden sm:inline`}>Only plays here. Nothing on stream changes.</span>
          </div>
        }
        before={
          <>
            <NeonCard>
              {controls}
              {err && <p className="text-sm text-rose-300 mt-2">{err}</p>}
              {kind !== "discord" && <p className={`${hint} mt-2`}>The stream shows the change within about a second.</p>}
            </NeonCard>
            {kind === "message" && (
              <NeonCard>
                <p className="font-medium">📝 Your messages</p>
                <p className={`${hint} mb-2`}>
                  One per line, up to 10. Put {"{n}"} where the number goes, like NEED {"{n}"} TO JOIN. Saves when you click away.
                </p>
                <textarea
                  className={`${field} min-h-[120px] leading-relaxed`}
                  value={draft ?? ((look.msgs as string[]) ?? []).join("\n")}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => {
                    if (draft === null) return;
                    update({ msgs: draft.split("\n").map((m) => m.trim().slice(0, 60)).filter(Boolean).slice(0, 10) });
                    setDraft(null);
                  }}
                  aria-label="Your messages, one per line"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {MESSAGE_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`${button} !px-2 !py-1 text-xs`}
                      disabled={((look.msgs as string[]) ?? []).length >= 10}
                      onClick={() => {
                        setDraft(null);
                        update({ msgs: [...((look.msgs as string[]) ?? []), p].slice(0, 10) });
                      }}
                    >
                      + {p}
                    </button>
                  ))}
                </div>
                <label className="block mt-3">
                  <span className="text-sm">When the number hits 0, show</span>
                  <input className={`${field} mt-1`} value={str("fullText")} maxLength={60} onChange={(e) => update({ fullText: e.target.value })} />
                </label>
              </NeonCard>
            )}
          </>
        }
        after={
          <>
            <ObsCard path={`/overlay/${kind}/${guildId}`} w={look.canvasW} h={look.canvasH} />
            <NeonCard>
              <p className="font-medium">🎛️ Stream Deck</p>
              <p className={`${hint} mb-2`}>
                Needs the Spartacus plugin, version {kind === "message" ? "1.9" : "1.4"} or newer. Get it on the{" "}
                <Link href={`/dashboard/${guildId}/stream-deck`} className="text-neon-blue underline">
                  Stream Deck page
                </Link>
                .
              </p>
              <p className="text-sm text-slate-300">{deckNote[kind]}</p>
            </NeonCard>
          </>
        }
      >
          {kind === "message" && (
            <Choices title="Extra when it changes" cols={3} items={MESSAGE_EXTRAS} value={str("extra")} onPick={(extra) => pick({ extra })} />
          )}
          {kind === "timer" && (
            <>
              <Choices title="Counts" cols={2} items={[["down", "Down (countdown)"], ["up", "Up (stopwatch)"]] as const} value={str("timerMode")} onPick={(timerMode) => update({ timerMode })} />
              <Choices title="Countdown length (Restart uses it)" cols={4} items={TIMER_LENGTHS} value={Number(look.timerLen)} onPick={(timerLen) => update({ timerLen })} />
            </>
          )}
          <AnimChoices items={info.anims} value={look.anim} onPick={(anim) => pick({ anim })} />
          <Choices title="Layout" cols={info.layouts.length === 3 ? 3 : 2} items={info.layouts} value={look.layout} onPick={(layout) => pick({ layout })} />
          {iconChoices && <Choices title="Icon" items={iconChoices} value={str("icon")} onPick={(icon) => pick({ icon })} />}
          <CommonLook
            look={look}
            pick={pick}
            sounds={info.sounds}
            colorTitle={({ winloss: "Wins number color", timer: "Time color", goal: "Bar and number color", game: "Name color", message: "Message color", ticker: "Name color", discord: "Invite color", challenge: "Number color" } as Record<OverlayKind, string>)[kind]}
          />
          {kind === "winloss" && (
            <>
              <ColorChoices title="Losses number color" value={str("dcolor")} onPick={(dcolor) => pick({ dcolor }, "losses")} />
              <Choices title="+/− colors" cols={2} items={[["kd", "Wins green, losses red"], ["updown", "Up green, down red"]] as const} value={str("colors")} onPick={(colors) => pick({ colors }, "losses")} />
              <Choices title="+/− words" cols={2} items={[["num", "+1"], ["word", "+1 WIN"]] as const} value={str("dtext")} onPick={(dtext) => pick({ dtext })} />
              {!!look.streakOn && <Choices title="Win streak every" items={WIN_STREAKS} value={Number(look.streakEvery)} onPick={(streakEvery) => update({ streakEvery })} />}
            </>
          )}

          <div className="grid sm:grid-cols-2 gap-2 mt-4">
            {toggles.map(([k, name, desc]) => (
              <Toggle key={k} on={!!look[k]} name={name} desc={desc} onChange={(on) => update({ [k]: on })} />
            ))}
          </div>

          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            {words.map(([k, name, max]) => (
              <label key={k} className="block">
                <span className="text-sm">{name}</span>
                <input className={`${field} mt-1`} value={str(k)} maxLength={max} placeholder="Leave empty for none" onChange={(e) => update({ [k]: e.target.value })} />
              </label>
            ))}
            <label className="block">
              <span className="text-sm">Size: {look.size}%</span>
              <input type="range" className="w-full mt-3" min={30} max={250} step={5} value={look.size} onChange={(e) => update({ size: Number(e.target.value) })} />
            </label>
          </div>
          {changed && (
            <button className={`${button} mt-3`} onClick={() => update(defaults as Partial<OverlayState>)}>
              Back to the default look
            </button>
          )}
      </CounterPreview>
    </div>
  );
}
