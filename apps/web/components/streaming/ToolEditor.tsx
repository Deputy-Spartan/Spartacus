"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { TOOLS, TOOL_COMMANDS, type ToolKind, type ToolRow } from "@spartacus/shared";
import { NeonCard } from "../ui/NeonCard";
import { SaveStatus } from "../ui/SaveStatus";
import { PageGuideButton } from "../nav/PageGuideButton";
import { ShowOnStream } from "./ShowOnStream";
import { ObsCard, Swatch, Toggle, button, field, hint } from "./CounterParts";
import { useAutoSave } from "../../lib/useAutoSave";
import { api } from "../../lib/api";

// Streaming › Overlays › stream tools: one page for each of the 18 tools. The
// top card has its buttons; the preview shows the real overlay (with live
// data and every event) using the settings on this page, saved by themselves.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const W = 1920;
const H = 1080;
const FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Lilita+One&family=Bangers&family=Russo+One&family=Black+Ops+One&family=Bebas+Neue&family=Luckiest+Guy&display=swap";
const FONT_NAME: Record<string, string> = { lilita: "Lilita One", bangers: "Bangers", russo: "Russo One", blackops: "Black Ops One", bebas: "Bebas Neue", luckiest: "Luckiest Guy" };
type Settings = ToolRow["settings"];
type Feed = { state: Record<string, unknown>; live: Record<string, unknown>; events: ToolRow["events"]; now: number };

export function ToolEditor({ guildId, kind }: { guildId: string; kind: ToolKind }) {
  const info = TOOLS[kind];
  const [settings, setSettings] = useState<Settings | null>(null);
  const [row, setRow] = useState<ToolRow | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const feed = useRef<Feed | null>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);

  useEffect(() => {
    api
      .getTool(guildId, kind)
      .then(async (r) => {
        let s = r.settings;
        // The squad box follows whoever set it up.
        if (kind === "squad" && !s.followUserId) {
          const me = await api.getMe().catch(() => null);
          if (me?.id) s = { ...s, followUserId: me.id };
        }
        setRow(r);
        setSettings(s);
      })
      .catch(() => setFailed(true));
  }, [guildId, kind]);

  const autoSave = useAutoSave(settings, async () => {
    if (settings) await api.saveTool(guildId, kind, settings);
  });

  // The preview: the real overlay, sent this page's settings plus the live
  // state, live data and events from the same place OBS reads.
  const send = () => {
    if (!settings || !feed.current) return;
    frame.current?.contentWindow?.postMessage({ type: "tool", settings, ...feed.current }, window.location.origin);
  };
  useEffect(() => {
    let stop = false;
    const pull = () =>
      fetch(`${API_URL}/public/tool/${kind}/${guildId}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((r) => {
          if (stop || !r) return;
          feed.current = { state: r.state, live: r.live, events: r.events, now: r.now };
          send();
        })
        .catch(() => null);
    pull();
    const t = setInterval(() => !document.hidden && pull(), 1200);
    return () => {
      stop = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId, kind, settings]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / W);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [settings === null]);

  if (failed) return <p className="text-rose-300">Couldn&apos;t load this tool. Refresh the page to try again.</p>;
  if (!settings || !row) return <p className="text-slate-400">Loading…</p>;

  const update = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch } as Settings);
  async function act(label: string, a: Record<string, unknown>) {
    setBusy(label);
    setMsg(null);
    try {
      // Save first, so the button uses what's on the page.
      await api.saveTool(guildId, kind, settings!);
      const r = await api.toolAction(guildId, kind, a);
      setRow(r);
      setMsg({ ok: true, text: "Done. It shows on stream within a second." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't do that. Try again." });
    } finally {
      setBusy("");
    }
  }
  const marks = kind === "clip" ? ((row.state.marks as Array<{ at: number; into: number | null; big: boolean }>) ?? []) : [];
  const clock = (ms: number) => {
    const t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  };
  const deckCmds = TOOL_COMMANDS.filter((c) => c[2] === kind);

  return (
    <div className="max-w-4xl">
      <link rel="stylesheet" href={FONT_LINK} />
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

      <div className="space-y-4">
        {(info.buttons.length > 0 || info.auto) && (
          <NeonCard>
            {info.auto && <p className="text-sm text-slate-300">{info.auto}</p>}
            {info.buttons.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                {info.buttons.map(([label, a], i) => (
                  <button key={label} className={i === 0 ? "neon-button" : button} disabled={!!busy} onClick={() => act(label, a)}>
                    {busy === label ? "…" : label}
                  </button>
                ))}
              </div>
            )}
            {msg && <p className={`text-sm mt-2 ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>{msg.text}</p>}
            {kind === "squad" && <p className={`${hint} mt-2`}>It shows the voice channel you&apos;re in. Join one in Discord to see it in the preview.</p>}
            {kind === "clip" && (
              <div className="mt-4">
                <p className="text-sm font-medium mb-1.5">Your clip marks</p>
                {marks.length === 0 ? (
                  <p className={hint}>None yet. Press 📌 Clip it (or the Stream Deck Clip It key).</p>
                ) : (
                  <ol className="space-y-1 text-sm text-slate-300 max-h-64 overflow-y-auto">
                    {[...marks].reverse().map((m, i) => (
                      <li key={m.at} className="flex flex-wrap gap-x-2 rounded-lg border border-white/10 px-2.5 py-1.5 tabular-nums">
                        <span>{m.big ? "⭐" : "📌"} #{marks.length - i}</span>
                        <span>{new Date(m.at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}</span>
                        {m.into != null && <span className="text-slate-400">· {clock(m.into)} into the stream</span>}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </NeonCard>
        )}

        <NeonCard>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <p className="font-medium">👀 Preview</p>
              <p className={hint}>The checkered part is see-through on stream. Buttons above play here too.</p>
            </div>
            <SaveStatus status={autoSave} />
          </div>
          <div ref={box} className="relative overflow-hidden rounded-lg border border-white/10 bg-black w-full" style={{ aspectRatio: `${W} / ${H}` }}>
            <iframe
              ref={frame}
              src={`/overlays/tool.html?${new URLSearchParams({ kind, preview: "1" })}`}
              onLoad={send}
              title="Overlay preview"
              className="absolute left-0 top-0 border-0 pointer-events-none"
              style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "0 0" }}
            />
          </div>

          {kind === "stats" && (
            <div className="mt-4">
              <p className="text-sm font-medium mb-1.5">What it shows</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {info.toggles.map(([k, name]) => (
                  <button
                    key={k}
                    type="button"
                    role="switch"
                    aria-checked={!!settings[k]}
                    onClick={() => update({ [k]: !settings[k] })}
                    className={`text-sm text-left rounded-lg border px-2.5 py-2 transition-colors ${settings[k] ? "border-neon-blue bg-neon-blue/10 text-white font-semibold" : "border-white/10 text-slate-400 hover:border-white/25"}`}
                  >
                    {settings[k] ? "✓ " : ""}
                    {name}
                  </button>
                ))}
              </div>
              <p className={`${hint} mt-1.5`}>Tap to turn each one on or off. Only the ones you turn on show on stream.</p>
            </div>
          )}
          {Object.entries(info.groups).map(([key, g]) => (
            <div key={key} className="mt-4">
              <p className="text-sm mb-1.5">{g.title}</p>
              <div className={`grid gap-2 ${g.kind === "big" ? "grid-cols-2 sm:grid-cols-3" : g.kind === "four" ? "grid-cols-4" : "grid-cols-3"}`}>
                {g.items.map(([id, name, desc]) => {
                  const on = String(settings[key]) === String(id);
                  return (
                    <button
                      key={String(id)}
                      type="button"
                      onClick={() => update({ [key]: id })}
                      aria-pressed={on}
                      className={`rounded-lg border transition-colors min-w-0 ${g.kind === "big" ? "text-left p-2.5" : "text-sm px-1.5 py-2"} ${on ? "border-neon-blue bg-neon-blue/10 text-white font-semibold" : "border-white/10 text-slate-300 hover:border-white/25"}`}
                    >
                      {g.kind === "big" ? (
                        <>
                          <span className="block font-semibold text-sm">{name}</span>
                          {desc && <span className={hint}>{desc}</span>}
                        </>
                      ) : (
                        <span style={g.font ? { fontFamily: `"${FONT_NAME[String(id)]}", sans-serif`, fontSize: 16 } : undefined}>
                          {(g.swatch || key === "color") && <Swatch c={String(id)} />}
                          {name}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {info.toggles.length > 0 && kind !== "stats" && (
            <div className="grid sm:grid-cols-2 gap-2 mt-4">
              {info.toggles.map(([k, name, desc]) => (
                <Toggle key={k} on={!!settings[k]} name={name} desc={desc} onChange={(on) => update({ [k]: on })} />
              ))}
            </div>
          )}
          {info.words.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-3 mt-4">
              {info.words.map(([k, name]) => (
                <label key={k} className="block">
                  <span className="text-sm">{name}</span>
                  <input className={`${field} mt-1`} value={String(settings[k] ?? "")} maxLength={k === "link" ? 300 : 120} placeholder="Leave empty for none" onChange={(e) => update({ [k]: e.target.value })} />
                </label>
              ))}
            </div>
          )}
          <button className={`${button} mt-4`} onClick={() => setSettings({ ...info.settings, ...(kind === "squad" ? { followUserId: settings.followUserId } : {}) })}>
            Back to the default look
          </button>
        </NeonCard>

        <ObsCard path={`/overlay/${kind}/${guildId}`} w={W} h={H} note={<p className={`${hint} mt-3`}>This one is the full screen size, so it lines up with your stream. The see-through parts don&apos;t cover anything.</p>} />

        {deckCmds.length > 0 && (
          <NeonCard>
            <p className="font-medium">🎛️ Stream Deck</p>
            <p className={`${hint} mb-2`}>
              Needs the Spartacus plugin, version 1.5 or newer. Get it on the{" "}
              <Link href={`/dashboard/${guildId}/stream-deck`} className="text-neon-blue underline">
                Stream Deck page
              </Link>
              .
            </p>
            <p className="text-sm text-slate-300">
              Drag Spartacus → 🧰 Overlay Tool onto a key and pick: {deckCmds.map((c) => c[1]).join(", ")}.
              {kind === "clip" && " Or use the 📌 Clip It key."}
            </p>
          </NeonCard>
        )}
      </div>
    </div>
  );
}
