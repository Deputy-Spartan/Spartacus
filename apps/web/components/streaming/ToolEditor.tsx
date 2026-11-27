"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AFK_MAX, TOOLS, TOOL_COMMANDS, cleanAfkList, type AfkItem, type ToolKind, type ToolRow, type ToolSection } from "@spartacus/shared";
import { NeonCard } from "../ui/NeonCard";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { PageGuideButton } from "../nav/PageGuideButton";
import { ShowOnStream } from "./ShowOnStream";
import { CanvasPicker, EditorSplit, ObsCard, PreviewPane, Swatch, Toggle, button, field, hint } from "./CounterParts";
import { useAutoSave } from "../../lib/useAutoSave";
import { api } from "../../lib/api";

// Streaming › Overlays › stream tools: one page for each of the 18 tools. The
// top card has its buttons; the preview shows the real overlay (with live
// data and every event) using the settings on this page, saved by themselves.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
// The tools are made for a 1920x1080 stream; any 16:9 size scales the same.
const TOOL_CANVASES = [
  [1920, 1080, "1080p"],
  [1280, 720, "720p"],
  [2560, 1440, "1440p"],
  [3840, 2160, "4K"],
] as const;
const FONT_NAME: Record<string, string> = { lilita: "Lilita One", bangers: "Bangers", russo: "Russo One", blackops: "Black Ops One", bebas: "Bebas Neue", luckiest: "Luckiest Guy", teko: "Teko", barlow: "Barlow Condensed", fredoka: "Fredoka", marker: "Permanent Marker" };
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

  const W = Number(settings.canvasW) || 1920;
  const H = Number(settings.canvasH) || 1080;

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

      <EditorSplit
        preview={
          <PreviewPane
            src={`/overlays/tool.html?${new URLSearchParams({ kind, preview: "1" })}`}
            w={W}
            h={H}
            frameRef={frame}
            onLoad={send}
            status={autoSave}
            note="The checkered part is see-through on stream. Buttons play here too."
            canvas={
              <CanvasPicker
                w={W}
                h={H}
                sizes={TOOL_CANVASES}
                onPick={(canvasW, canvasH) => update({ canvasW, canvasH })}
                note="Match your OBS canvas (OBS Settings → Video → Base resolution) and use the same Width and Height on the browser source."
              />
            }
          />
        }
      >
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
            {kind === "qr" && Number(settings.when) > 0 && (
              <p className={`${hint} mt-2`}>
                The preview always shows it. On stream it pops up every {String(settings.when)} minutes for 20 seconds, and 👀 Show now brings it up any time.
              </p>
            )}
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

        {kind === "afk" && <AfkCommands guildId={guildId} settings={settings} update={update} busy={busy} act={act} />}

        <NeonCard>
          <p className="font-medium">🎨 Look and words</p>
          <p className={hint}>Each change shows in the preview.</p>

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
                      onClick={() => update({ [key]: id, ...(key === "preset" ? (info.presets?.[String(id)] ?? {}) : {}) })}
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
              {key === "preset" && info.sections && <ToolSections sections={info.sections} settings={settings} update={update} />}
            </div>
          ))}
          {info.sections && !info.presets && <ToolSections sections={info.sections} settings={settings} update={update} />}

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
          <button
            className={`${button} mt-4`}
            onClick={() =>
              setSettings({
                ...info.settings,
                canvasW: W,
                canvasH: H,
                // Your words, slices and AFK commands stay; only the look goes back.
                ...Object.fromEntries([...info.words.map(([k]) => k), "list", "followUserId"].filter((k) => k in settings).map((k) => [k, settings[k]])),
              })
            }
          >
            Back to the default look
          </button>
        </NeonCard>

        {kind === "cmdfx" && (
          <NeonCard>
            <p className="font-medium">⌨️ Your commands</p>
            <p className="text-sm text-slate-300 mt-1">
              Which commands play a sound or pop-up, and the Lumia Stream, Streamer.bot and OBS setup, are on the{" "}
              <Link href={`/dashboard/${guildId}/chat-commands`} className="text-neon-blue underline">Chat Commands page</Link>. Use the OBS link from its Other apps tab if you use any of those apps.
            </p>
          </NeonCard>
        )}

        <ObsCard path={`/overlay/${kind}/${guildId}`} w={W} h={H} note={<p className={`${hint} mt-3`}>This one is your full stream size, so it lines up with your stream. The see-through parts don&apos;t cover anything.</p>} />

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
      </EditorSplit>
    </div>
  );
}

// Fine-tuning: fold-out groups of color pickers, sliders, switches and picks.
function ToolSections({ sections, settings, update }: { sections: ToolSection[]; settings: Settings; update: (p: Partial<Settings>) => void }) {
  return (
    <div className="mt-4 space-y-2">
      <p className="text-sm">Customize</p>
      {sections.map((sec) => (
        <details key={sec.title} className="rounded-lg border border-white/10 group">
          <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-semibold flex items-center justify-between">
            {sec.title}
            <span className="text-neon-blue group-open:rotate-45 transition-transform text-lg leading-none">+</span>
          </summary>
          <div className="px-3 pb-3 space-y-3">
            {sec.fields
              .filter((f) => !f.show || String(settings[f.show[0]]) === String(f.show[1]))
              .map((f) => {
                const v = settings[f.key];
                const id = `tf-${f.key}`;
                if (f.type === "switch")
                  return (
                    <div key={f.key} className="flex items-center justify-between gap-3">
                      <span className="text-sm min-w-0">{f.label}</span>
                      <ToggleSwitch size="sm" label={f.label} enabled={!!v} onChange={(on) => update({ [f.key]: on })} />
                    </div>
                  );
                if (f.type === "color")
                  return (
                    <label key={f.key} htmlFor={id} className="flex items-center justify-between gap-3">
                      <span className="text-sm min-w-0">{f.label}</span>
                      <input id={id} type="color" value={String(v)} onChange={(e) => update({ [f.key]: e.target.value })} className="h-8 w-12 rounded border border-white/10 bg-base-950 p-0.5 cursor-pointer" />
                    </label>
                  );
                if (f.type === "range")
                  return (
                    <label key={f.key} htmlFor={id} className="block">
                      <span className="flex justify-between text-sm">
                        <span>{f.label}</span>
                        <span className="text-slate-400 tabular-nums">
                          {String(v)}
                          {f.unit ?? ""}
                        </span>
                      </span>
                      <input id={id} type="range" min={f.min} max={f.max} step={f.step ?? 1} value={Number(v)} onChange={(e) => update({ [f.key]: Number(e.target.value) })} className="w-full mt-1" />
                    </label>
                  );
                if (f.type === "text")
                  return (
                    <label key={f.key} htmlFor={id} className="flex items-center justify-between gap-3">
                      <span className="text-sm min-w-0">{f.label}</span>
                      <input id={id} className={`${field} !w-28`} value={String(v ?? "")} maxLength={f.max} onChange={(e) => update({ [f.key]: e.target.value })} />
                    </label>
                  );
                if (f.type === "pick")
                  return (
                    <div key={f.key}>
                      <p className="text-sm mb-1.5">{f.label}</p>
                      <div className={`grid gap-2 ${f.items.length === 4 ? "grid-cols-4" : f.items.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                        {f.items.map(([iv, name]) => (
                          <button
                            key={String(iv)}
                            type="button"
                            aria-pressed={String(v) === String(iv)}
                            onClick={() => update({ [f.key]: iv })}
                            className={`text-sm rounded-lg border px-1.5 py-2 transition-colors ${String(v) === String(iv) ? "border-neon-blue bg-neon-blue/10 text-white font-semibold" : "border-white/10 text-slate-300 hover:border-white/25"}`}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                // A list of colors.
                const list = String(v || "").split(",").filter(Boolean);
                const set = (next: string[]) => update({ [f.key]: next.join(",") });
                return (
                  <div key={f.key}>
                    <p className="text-sm mb-1.5">{f.label}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {list.map((c, i) => (
                        <input key={i} type="color" aria-label={`Color ${i + 1}`} value={c} onChange={(e) => set(list.map((x, j) => (j === i ? e.target.value : x)))} className="h-8 w-10 rounded border border-white/10 bg-base-950 p-0.5 cursor-pointer" />
                      ))}
                      <button type="button" className={`${button} !px-2.5 !py-1`} disabled={list.length >= f.max} onClick={() => set([...list, list[list.length % 2] ?? "#ffffff"])} aria-label="Add a color">
                        +
                      </button>
                      <button type="button" className={`${button} !px-2.5 !py-1`} disabled={list.length <= 1} onClick={() => set(list.slice(0, -1))} aria-label="Remove the last color">
                        −
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </details>
      ))}
    </div>
  );
}

// AFK popups: your commands (edit, add, try) and their links for Lumia.
function AfkCommands({ guildId, settings, update, busy, act }: { guildId: string; settings: Settings; update: (p: Partial<Settings>) => void; busy: string; act: (label: string, a: Record<string, unknown>) => void }) {
  // Read as typed (a half-typed command isn't dropped); the server tidies it on save.
  const items: AfkItem[] = (() => {
    try {
      const v = JSON.parse(String(settings.list));
      if (Array.isArray(v)) return v as AfkItem[];
    } catch {
      /* fall through */
    }
    return cleanAfkList(null);
  })();
  const [runKey, setRunKey] = useState("");
  const [copied, setCopied] = useState("");
  useEffect(() => {
    api.getChatCommands(guildId).then((r) => setRunKey(r.config.runKey ?? "")).catch(() => null);
  }, [guildId]);
  const save = (next: AfkItem[]) => update({ list: JSON.stringify(next) });
  const change = (i: number, patch: Partial<AfkItem>) => save(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const link = (cmd: string) => `${API_URL}/public/chat-command/${guildId}/${encodeURIComponent(cmd)}?key=${runKey}&from=Lumia`;
  const copy = (text: string, what: string) =>
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(what);
        setTimeout(() => setCopied(""), 1500);
      })
      .catch(() => null);
  const back = String(settings.backCmd || "back");
  return (
    <NeonCard>
      <p className="font-medium">☕ Your AFK commands</p>
      <p className={hint}>Press Show to try one. In chat, add a number to set the minutes, like !coffee 8. !{back} clears it.</p>
      <div className="space-y-3 mt-3">
        {items.map((it, i) => (
          <div key={i} className="rounded-lg border border-white/10 p-2.5 space-y-2" style={{ borderLeft: `4px solid ${it.c}` }}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-400">!</span>
              <input className={`${field} !w-28 !p-1.5`} value={it.cmd} maxLength={20} aria-label="Command" onChange={(e) => change(i, { cmd: e.target.value.toLowerCase().replace(/[^\p{L}\p{N}_-]/gu, "") })} />
              <input className={`${field} !w-14 !p-1.5 text-center`} value={it.ico} maxLength={8} aria-label="Icon (emoji)" onChange={(e) => change(i, { ico: e.target.value })} />
              <input type="color" value={it.c} aria-label="Color" onChange={(e) => change(i, { c: e.target.value })} className="h-8 w-10 rounded border border-white/10 bg-base-950 p-0.5 cursor-pointer" />
              <label className="flex items-center gap-1 text-sm text-slate-300">
                <input className={`${field} !w-16 !p-1.5 tabular-nums`} type="number" min={1} max={120} value={it.min} aria-label="Minutes" onChange={(e) => change(i, { min: Number(e.target.value) || 1 })} />
                min
              </label>
              <span className="flex-1" />
              <button type="button" className="neon-button-sm" disabled={!!busy} onClick={() => act(`afk-${i}`, { op: "start", cmd: it.cmd })}>
                {busy === `afk-${i}` ? "…" : "Show"}
              </button>
              <button type="button" className={`${button} !px-2 !py-1`} aria-label={`Remove !${it.cmd}`} onClick={() => save(items.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              <input className={field} value={it.t} maxLength={30} placeholder="Title" aria-label="Title" onChange={(e) => change(i, { t: e.target.value })} />
              <input className={field} value={it.s} maxLength={60} placeholder="Second line" aria-label="Second line" onChange={(e) => change(i, { s: e.target.value })} />
            </div>
            {runKey && (
              <button type="button" className="text-xs text-neon-blue underline" onClick={() => copy(link(it.cmd), it.cmd)}>
                {copied === it.cmd ? "Copied ✓" : "Copy link for Lumia"}
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <button
          type="button"
          className={button}
          disabled={items.length >= AFK_MAX}
          onClick={() => save([...items, { cmd: `afk${items.length + 1}`, ico: "⏳", t: "Be right back", s: "", min: 5, c: "#d4a24c" }])}
        >
          + Add a command
        </button>
        {runKey && (
          <button type="button" className={button} onClick={() => copy(link(back), back)}>
            {copied === back ? "Copied ✓" : `Copy !${back} link for Lumia`}
          </button>
        )}
      </div>
      <p className={`${hint} mt-3`}>
        Lumia: make a command or button, add a web request action (GET) and paste the link. The links use the same key as{" "}
        <Link href={`/dashboard/${guildId}/chat-commands`} className="text-neon-blue underline">Chat Commands</Link>, so making a new key there changes them too.
      </p>
    </NeonCard>
  );
}
