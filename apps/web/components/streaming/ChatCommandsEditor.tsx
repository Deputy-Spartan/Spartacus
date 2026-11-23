"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CHAT_APP_ACTIONS,
  CHAT_COMMANDS_MAX,
  CHAT_GROUPS,
  CHAT_OVERLAY_ACTIONS,
  CHAT_POPUP_STYLES,
  CHAT_SOUNDS,
  CHAT_TIMERS_MAX,
  CHAT_VARIABLES,
  CHAT_WHO,
  STARTER_COMMANDS,
  STARTER_TIMERS,
  renderChatReply,
  type ChatCommand,
  type ChatCommandsConfig,
  type ChatRank,
} from "@spartacus/shared";
import { NeonCard } from "../ui/NeonCard";
import { SaveStatus } from "../ui/SaveStatus";
import { PageGuideButton } from "../nav/PageGuideButton";
import { Toggle, button, field, hint } from "./CounterParts";
import { useAutoSave } from "../../lib/useAutoSave";
import { api, type ChatCommandsData } from "../../lib/api";
import { ToggleSwitch } from "../ui/ToggleSwitch";

// Streaming › Chat Commands. Commands, timed messages, the link to Lumia /
// Streamer.bot / OBS, and counts & quotes. Saves by itself.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const TABS = [
  ["cmds", "⚡ Commands"],
  ["timers", "⏰ Timed messages"],
  ["apps", "🔌 Other apps"],
  ["data", "🔢 Counts & quotes"],
] as const;
type Tab = (typeof TABS)[number][0];
const GROUP_NAME: Record<string, string> = { Info: "Info", Fun: "Fun", Mods: "Mods", Overlays: "Overlays", Mine: "Your own" };
const OV_TAG: Record<string, string> = { alert: "🎬 Pop-up", need: "🪧 Message box", full: "🪧 Message box", next: "🪧 Message box", win: "🏆 W/L", loss: "🏆 W/L" };
const APP_TAG: Record<string, string> = { lumia: "🔌 Lumia", "lumia-alert": "🔌 Lumia", sbot: "🔌 Streamer.bot", "obs-scene": "🔌 OBS", "obs-src": "🔌 OBS" };
const APPS_KEY = "spartacus-cmdfx-apps";
type Apps = { lumia: string; lumiaport: string; sbport: string; obsport: string; obs: string };
const NO_APPS: Apps = { lumia: "", lumiaport: "39231", sbport: "8080", obsport: "4455", obs: "" };

const blank = (group = "Mine"): ChatCommand => ({ id: `c${Date.now().toString(36)}`, name: "", alias: [], reply: "", who: 0, cd: 5, sound: "none", soundUrl: "", ov: "none", style: "pop", emoji: "", atext: "", app: "none", appv: "", on: true, group });

export function ChatCommandsEditor({ guildId }: { guildId: string }) {
  const [data, setData] = useState<ChatCommandsData | null>(null);
  const [cfg, setCfg] = useState<ChatCommandsConfig | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>("cmds");
  const [editing, setEditing] = useState<ChatCommand | null>(null);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    api.getChatCommands(guildId).then((d) => { setData(d); setCfg(d.config); }).catch(() => setFailed(true));
  }, [guildId]);
  const status = useAutoSave(cfg, async () => {
    if (!cfg) return;
    const r = await api.saveChatCommands(guildId, cfg);
    setCfg(r.config);
  });

  if (failed) return <p className="text-rose-300">Couldn&apos;t load Chat Commands. Refresh the page to try again.</p>;
  if (!cfg || !data) return <p className="text-slate-400">Loading…</p>;

  const set = (patch: Partial<ChatCommandsConfig>) => setCfg({ ...cfg, ...patch });
  const setCmd = (c: ChatCommand) => set({ cmds: cfg.cmds.map((k) => (k.id === c.id ? c : k)) });

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">⌨️ Chat Commands</h1>
          <p className="text-slate-400 text-sm mt-1">!discord, !uptime, !so and more, answered in your Kick and Twitch chat. Sounds, pop-ups and other apps too.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <SaveStatus status={status} />
          <PageGuideButton guildId={guildId} inline />
        </div>
      </div>

      <Setup guildId={guildId} data={data} cfg={cfg} set={set} />

      <nav className="flex gap-2 overflow-x-auto my-4 sticky top-14 sm:top-[68px] z-[5] bg-base-950/95 backdrop-blur py-2 -mx-1 px-1" role="tablist">
        {TABS.map(([id, name]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`shrink-0 text-sm px-3.5 py-2 rounded-full border transition-colors ${tab === id ? "border-neon-blue bg-neon-blue/15 text-white font-semibold" : "border-white/10 text-slate-300 hover:border-white/25"}`}>
            {name}
          </button>
        ))}
      </nav>

      {tab === "cmds" && (
        <Commands
          guildId={guildId}
          cfg={cfg}
          set={set}
          setCmd={setCmd}
          onEdit={(c, fresh) => { setEditing(c); setIsNew(fresh); }}
        />
      )}
      {tab === "timers" && <Timers cfg={cfg} set={set} />}
      {tab === "apps" && <Apps guildId={guildId} cfg={cfg} onKey={(c) => setCfg(c)} />}
      {tab === "data" && <Counts guildId={guildId} cfg={cfg} />}

      {editing && (
        <EditCommand
          cmd={editing}
          isNew={isNew}
          cfg={cfg}
          onClose={() => setEditing(null)}
          onSave={(c) => {
            if (isNew) set({ cmds: [...cfg.cmds, c] });
            else setCmd(c);
            setEditing(null);
          }}
          onDelete={() => { set({ cmds: cfg.cmds.filter((k) => k.id !== editing.id) }); setEditing(null); }}
        />
      )}
    </div>
  );
}

// ---- Is everything connected? ----
function Setup({ guildId, data, cfg, set }: { guildId: string; data: ChatCommandsData; cfg: ChatCommandsConfig; set: (p: Partial<ChatCommandsConfig>) => void }) {
  const growth = `/dashboard/${guildId}/stream-growth`;
  return (
    <NeonCard>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-medium">Setup</p>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <ToggleSwitch size="sm" enabled={cfg.on} onChange={(v) => set({ on: v })} />
          Chat commands on
        </label>
      </div>
      <div className="grid sm:grid-cols-2 gap-2 mt-3">
        {(["kick", "twitch"] as const).map((p) => {
          const acc = data.accounts.filter((a) => a.platform === p);
          const ok = acc.some((a) => a.canChat);
          const name = p === "kick" ? "Kick" : "Twitch";
          return (
            <div key={p} className="rounded-lg border border-white/10 p-2.5">
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="text-sm font-medium">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-[-1px]" style={{ background: p === "kick" ? "#53fc18" : "#9146ff" }} />
                  {name} chat
                </span>
                <ToggleSwitch size="sm" enabled={cfg[p]} onChange={(v) => set({ [p]: v })} label={`Use commands in ${name} chat`} />
              </label>
              <p className={`text-xs mt-1 ${ok ? "text-emerald-300" : "text-amber-300"}`}>
                {ok ? (
                  `✓ Replies as ${acc.find((a) => a.canChat)?.displayName || acc.find((a) => a.canChat)?.login}`
                ) : acc.length ? (
                  <>Connect {name} again on <Link href={growth} className="underline">Stream Growth</Link> so Spartacus can post in chat.</>
                ) : (
                  <>Connect {name} on <Link href={growth} className="underline">Stream Growth</Link> first.</>
                )}
              </p>
            </div>
          );
        })}
      </div>
      <p className={`${hint} mt-2`}>
        {data.overlayOpened ? "✓ " : ""}Sounds and pop-ups play through the{" "}
        <Link href={`/dashboard/${guildId}/overlays/cmdfx`} className="text-neon-blue underline">Command alerts overlay</Link> in OBS. TikTok and YouTube chat can&apos;t be read by other apps yet, so commands work on Kick and Twitch.
      </p>
    </NeonCard>
  );
}

// ---- The list ----
function Commands({ guildId, cfg, set, setCmd, onEdit }: { guildId: string; cfg: ChatCommandsConfig; set: (p: Partial<ChatCommandsConfig>) => void; setCmd: (c: ChatCommand) => void; onEdit: (c: ChatCommand, fresh: boolean) => void }) {
  const [sure, setSure] = useState(false);
  const missing = STARTER_COMMANDS.filter((s) => !cfg.cmds.some((c) => c.name === s.name || c.alias.includes(s.name)));
  return (
    <div className="space-y-4">
      <NeonCard>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">Commands ({cfg.cmds.length})</p>
          <button className="neon-button" disabled={cfg.cmds.length >= CHAT_COMMANDS_MAX} onClick={() => onEdit(blank(), true)}>＋ New command</button>
        </div>
        <p className={`${hint} mt-1`}>Tap Edit to change the reply, who can use it, the sound, the pop-up, or what it sends to another app. The switch turns one on or off.</p>
        {CHAT_GROUPS.map((g) => {
          const list = cfg.cmds.filter((c) => c.group === g);
          if (!list.length) return null;
          return (
            <div key={g} className="mt-4">
              <p className="text-xs uppercase tracking-wide text-slate-500 mb-1.5">{GROUP_NAME[g]}</p>
              <div className="space-y-1.5">
                {list.map((c) => (
                  <div key={c.id} className={`flex items-center gap-3 rounded-lg border border-white/10 p-2.5 ${c.on ? "" : "opacity-50"}`}>
                    <ToggleSwitch size="sm" enabled={c.on} onChange={(v) => setCmd({ ...c, on: v })} label={`Turn !${c.name} on or off`} />
                    <button className="min-w-0 flex-1 text-left" onClick={() => onEdit(c, false)}>
                      <span className="font-mono text-sm text-neon-blue">!{c.name}</span>
                      {c.alias.length > 0 && <span className="text-xs text-slate-500"> · also !{c.alias.join(", !")}</span>}
                      <span className="block text-sm text-slate-400 truncate">{c.reply || "(no reply)"}</span>
                      <span className="flex flex-wrap gap-1 mt-1">
                        {[CHAT_WHO[c.who], c.cd ? `${c.cd}s wait` : "", c.sound !== "none" || c.soundUrl ? "🔊 Sound" : "", OV_TAG[c.ov] ?? "", APP_TAG[c.app] ?? ""].filter(Boolean).map((t) => (
                          <span key={t} className="text-[11px] rounded border border-white/10 px-1.5 text-slate-400">{t}</span>
                        ))}
                      </span>
                    </button>
                    <button className={`${button} shrink-0`} onClick={() => onEdit(c, false)}>Edit</button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {missing.length > 0 && (
          <div className="mt-4">
            <p className="text-sm mb-1.5">Add a starter command back</p>
            <div className="flex flex-wrap gap-1.5">
              {missing.map((s) => (
                <button key={s.name} className={`${button} !py-1 font-mono`} onClick={() => set({ cmds: [...cfg.cmds, { ...s, id: `${s.name}-${Date.now().toString(36)}` }] })}>＋ !{s.name}</button>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button
            className={`${button} text-rose-300`}
            onClick={() => {
              if (!sure) { setSure(true); setTimeout(() => setSure(false), 4000); return; }
              set({ cmds: STARTER_COMMANDS.map((c) => ({ ...c })), timers: STARTER_TIMERS.map((t) => ({ ...t })) });
              setSure(false);
            }}
          >
            {sure ? "Tap again: this removes your own commands" : "Reset to the starter commands"}
          </button>
        </div>
      </NeonCard>
      <TryIt guildId={guildId} cfg={cfg} />
    </div>
  );
}

// ---- See what a reply looks like (nothing is sent) ----
function TryIt({ guildId, cfg }: { guildId: string; cfg: ChatCommandsConfig }) {
  const [text, setText] = useState("!so Nova_Mod");
  const [rank, setRank] = useState<ChatRank>(3);
  const [out, setOut] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const preview = () => {
    const t = text.trim();
    const parts = t.replace(/^!/, "").split(/\s+/);
    const w = (parts.shift() ?? "").toLowerCase();
    const c = cfg.cmds.find((k) => k.on && (k.name === w || k.alias.includes(w)));
    if (!t.startsWith("!") || !c) return setOut("That isn't one of your commands (or it's turned off).");
    if (rank < c.who) return setOut(`Nothing happens: !${c.name} is for ${CHAT_WHO[c.who].toLowerCase()}.`);
    setOut(renderChatReply(c.reply, { user: "You", target: (parts[0] ?? "You").replace(/^@/, ""), args: parts.join(" "), platform: "kick", game: "Warzone", title: "Your stream title", liveMs: 83 * 60000, count: 1, counts: {}, cmds: cfg.cmds, n: 1, quote: "An example quote", followage: "1 year, 2 months" }));
  };
  const runReal = async () => {
    setBusy(true);
    const t = text.trim().replace(/^!/, "").split(/\s+/);
    try { setOut((await api.runChatCommand(guildId, t[0] ?? "", t.slice(1).join(" "))).message); } catch (e) { setOut(e instanceof Error ? e.message : "Couldn't run it."); }
    setBusy(false);
  };
  return (
    <NeonCard>
      <p className="font-medium">💬 Try a command</p>
      <p className={hint}>Preview shows the reply here only. Run for real posts it in your chat and plays on the Command alerts overlay.</p>
      <div className="flex flex-col sm:flex-row gap-2 mt-3">
        <select className={`${field} sm:w-40`} value={rank} onChange={(e) => setRank(Number(e.target.value) as ChatRank)} aria-label="Typed by">
          <option value={0}>👤 A viewer</option>
          <option value={1}>⭐ A sub</option>
          <option value={2}>🛡️ A mod</option>
          <option value={3}>👑 You</option>
        </select>
        <input className={`${field} font-mono`} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && preview()} aria-label="Command to try" />
        <button className="neon-button shrink-0" onClick={preview}>Preview</button>
        <button className={`${button} shrink-0`} disabled={busy} onClick={runReal}>{busy ? "…" : "Run for real"}</button>
      </div>
      {out && <p className="text-sm mt-3 rounded-lg bg-white/5 border border-white/10 p-2.5"><span className="text-neon-blue font-semibold">Spartacus: </span>{out}</p>}
    </NeonCard>
  );
}

// ---- One command ----
function EditCommand({ cmd, isNew, cfg, onClose, onSave, onDelete }: { cmd: ChatCommand; isNew: boolean; cfg: ChatCommandsConfig; onClose: () => void; onSave: (c: ChatCommand) => void; onDelete: () => void }) {
  const [c, setC] = useState<ChatCommand>(cmd);
  const [aliases, setAliases] = useState(cmd.alias.join(", "));
  const [err, setErr] = useState("");
  const [sure, setSure] = useState(false);
  const reply = useRef<HTMLTextAreaElement>(null);
  const up = (p: Partial<ChatCommand>) => setC({ ...c, ...p });
  const clean = (s: string) => s.trim().toLowerCase().replace(/^!+/, "").replace(/[^\p{L}\p{N}_-]/gu, "");
  const addVar = (v: string) => {
    const el = reply.current;
    const at = el?.selectionStart ?? c.reply.length;
    up({ reply: (c.reply.slice(0, at) + v + c.reply.slice(at)).slice(0, 400) });
    setTimeout(() => el?.focus(), 0);
  };
  const save = () => {
    const name = clean(c.name);
    const alias = aliases.split(",").map(clean).filter((a) => a && a !== name).slice(0, 5);
    if (!name) return setErr("Give the command a name, like discord.");
    const clash = cfg.cmds.find((k) => k.id !== c.id && [k.name, ...k.alias].some((n) => n === name || alias.includes(n)));
    if (clash) return setErr(`!${clash.name} already uses that name.`);
    if (c.soundUrl && !/^https:\/\//i.test(c.soundUrl)) return setErr("The sound link has to start with https://");
    onSave({ ...c, name, alias });
  };
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const sel = (label: string, value: string | number, items: Array<[string | number, string]>, on: (v: string) => void) => (
    <label className="block">
      <span className="text-sm">{label}</span>
      <select className={`${field} mt-1`} value={String(value)} onChange={(e) => on(e.target.value)}>
        {items.map(([k, n]) => <option key={String(k)} value={String(k)}>{n}</option>)}
      </select>
    </label>
  );
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={isNew ? "New command" : `Edit !${cmd.name}`}>
      <div className="bg-base-900 border border-white/10 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xl max-h-[92vh] overflow-y-auto p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-lg">{isNew ? "New command" : `Edit !${cmd.name}`}</p>
          <button className={button} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block"><span className="text-sm">Command</span><input className={`${field} mt-1 font-mono`} value={c.name} maxLength={30} placeholder="discord" onChange={(e) => up({ name: e.target.value })} /></label>
          <label className="block"><span className="text-sm">Also works as (commas between)</span><input className={`${field} mt-1 font-mono`} value={aliases} placeholder="dc, disc" onChange={(e) => setAliases(e.target.value)} /></label>
        </div>
        <label className="block">
          <span className="text-sm">Spartacus replies</span>
          <textarea ref={reply} className={`${field} mt-1 min-h-[72px]`} value={c.reply} maxLength={400} placeholder="Leave empty for no reply (just the sound or pop-up)" onChange={(e) => up({ reply: e.target.value })} />
        </label>
        <div className="flex flex-wrap gap-1">
          {CHAT_VARIABLES.map(([v, what]) => (
            <button key={v} type="button" title={what} className="font-mono text-[11px] rounded border border-dashed border-white/15 px-1.5 py-0.5 text-neon-blue hover:border-neon-blue" onClick={() => addVar(v)}>{v}</button>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {sel("Who can use it", c.who, CHAT_WHO.map((n, i) => [i, n]), (v) => up({ who: Number(v) as ChatRank }))}
          <label className="block"><span className="text-sm">Wait between uses (seconds)</span><input type="number" min={0} max={3600} className={`${field} mt-1`} value={c.cd} onChange={(e) => up({ cd: Math.max(0, Math.min(3600, Number(e.target.value) || 0)) })} /></label>
          {sel("Sound", c.sound, CHAT_SOUNDS, (sound) => up({ sound }))}
          <label className="block"><span className="text-sm">Or your own sound (link to an mp3)</span><input className={`${field} mt-1`} value={c.soundUrl} maxLength={400} placeholder="https://…/sound.mp3" onChange={(e) => up({ soundUrl: e.target.value.trim() })} /></label>
          {sel("On stream", c.ov, CHAT_OVERLAY_ACTIONS, (ov) => up({ ov }))}
          {c.ov === "alert" && sel("Pop-up style", c.style, CHAT_POPUP_STYLES, (style) => up({ style }))}
          {c.ov === "alert" && <label className="block"><span className="text-sm">Pop-up emoji</span><input className={`${field} mt-1`} value={c.emoji} maxLength={8} placeholder="🔥" onChange={(e) => up({ emoji: e.target.value })} /></label>}
          {c.ov === "alert" && <label className="block"><span className="text-sm">Pop-up words</span><input className={`${field} mt-1`} value={c.atext} maxLength={80} placeholder="Uses the reply when empty" onChange={(e) => up({ atext: e.target.value })} /></label>}
          {sel("Also send to", c.app, CHAT_APP_ACTIONS, (app) => up({ app }))}
          {c.app !== "none" && (
            <label className="block">
              <span className="text-sm">{c.app.startsWith("obs") ? (c.app === "obs-scene" ? "Scene name in OBS" : "Source name in OBS") : c.app === "sbot" ? "Action name in Streamer.bot" : c.app === "lumia-alert" ? "Alert name in Lumia" : "Command name in Lumia"}</span>
              <input className={`${field} mt-1`} value={c.appv} maxLength={80} placeholder={c.name || "hype"} onChange={(e) => up({ appv: e.target.value })} />
            </label>
          )}
          {sel("Group", c.group, CHAT_GROUPS.map((g) => [g, GROUP_NAME[g]]), (group) => up({ group }))}
        </div>
        {c.app !== "none" && <p className={hint}>Set up {APP_TAG[c.app]?.replace("🔌 ", "")} on the Other apps tab once.</p>}
        {err && <p className="text-sm text-rose-300">{err}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {!isNew ? (
            <button className={`${button} text-rose-300`} onClick={() => { if (sure) onDelete(); else { setSure(true); setTimeout(() => setSure(false), 3000); } }}>{sure ? "Tap again to delete" : "Delete"}</button>
          ) : <span />}
          <div className="flex gap-2">
            <button className={button} onClick={onClose}>Cancel</button>
            <button className="neon-button" onClick={save}>{isNew ? "Add command" : "Done"}</button>
          </div>
        </div>
        <p className={hint}>Changes save by themselves once you press {isNew ? "Add command" : "Done"}.</p>
      </div>
    </div>
  );
}

// ---- Timed messages ----
function Timers({ cfg, set }: { cfg: ChatCommandsConfig; set: (p: Partial<ChatCommandsConfig>) => void }) {
  const up = (id: string, p: Partial<ChatCommandsConfig["timers"][number]>) => set({ timers: cfg.timers.map((t) => (t.id === id ? { ...t, ...p } : t)) });
  return (
    <NeonCard>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">Timed messages</p>
        <button className="neon-button" disabled={cfg.timers.length >= CHAT_TIMERS_MAX} onClick={() => set({ timers: [...cfg.timers, { id: `t${Date.now().toString(36)}`, text: "Your message here", every: 15, chat: 5, on: true }] })}>＋ New</button>
      </div>
      <p className={`${hint} mt-1`}>Posted in your chat while you&apos;re live. Each waits for some chat in between, so Spartacus never talks to an empty room. One goes out per minute at most.</p>
      <div className="space-y-3 mt-3">
        {cfg.timers.length === 0 && <p className={hint}>None yet. Press ＋ New.</p>}
        {cfg.timers.map((t) => (
          <div key={t.id} className={`rounded-lg border border-white/10 p-3 space-y-2 ${t.on ? "" : "opacity-60"}`}>
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer"><ToggleSwitch size="sm" enabled={t.on} onChange={(v) => up(t.id, { on: v })} />On</label>
              <button className={`${button} !py-1 text-rose-300`} onClick={() => set({ timers: cfg.timers.filter((k) => k.id !== t.id) })}>Delete</button>
            </div>
            <textarea className={`${field} min-h-[56px]`} value={t.text} maxLength={400} onChange={(e) => up(t.id, { text: e.target.value })} aria-label="Message" />
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="text-sm">Every (minutes)</span><input type="number" min={1} max={240} className={`${field} mt-1`} value={t.every} onChange={(e) => up(t.id, { every: Math.max(1, Math.min(240, Number(e.target.value) || 1)) })} /></label>
              <label className="block"><span className="text-sm">After this many chat messages</span><input type="number" min={0} max={500} className={`${field} mt-1`} value={t.chat} onChange={(e) => up(t.id, { chat: Math.max(0, Math.min(500, Number(e.target.value) || 0)) })} /></label>
            </div>
          </div>
        ))}
      </div>
    </NeonCard>
  );
}

// ---- Lumia Stream, Streamer.bot, OBS ----
function Copy({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className={`${button} shrink-0`} onClick={() => navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => null)}>
      {done ? "Copied ✓" : label}
    </button>
  );
}
function Apps({ guildId, cfg, onKey }: { guildId: string; cfg: ChatCommandsConfig; onKey: (c: ChatCommandsConfig) => void }) {
  const [a, setA] = useState<Apps>(NO_APPS);
  const [pick, setPick] = useState(cfg.cmds[0]?.name ?? "");
  const [sure, setSure] = useState(false);
  useEffect(() => {
    try { setA({ ...NO_APPS, ...JSON.parse(localStorage.getItem(APPS_KEY) || "{}") }); } catch { /* none saved */ }
  }, []);
  const up = (p: Partial<Apps>) => {
    const next = { ...a, ...p };
    setA(next);
    try { localStorage.setItem(APPS_KEY, JSON.stringify(next)); } catch { /* private window */ }
  };
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const hash = new URLSearchParams(Object.entries({ lumia: a.lumia, lumiaport: a.lumiaport !== "39231" ? a.lumiaport : "", sbport: a.sbport !== "8080" ? a.sbport : "", obsport: a.obsport !== "4455" ? a.obsport : "", obs: a.obs }).filter(([, v]) => v)).toString();
  const obsLink = `${origin}/overlay/cmdfx/${guildId}${hash ? "#" + hash : ""}`;
  const run = (name: string, from: string) => `${API_URL}/public/chat-command/${guildId}/${encodeURIComponent(name)}?key=${cfg.runKey}&from=${from}`;
  const inp = (label: string, k: keyof Apps, o: { type?: string; ph?: string } = {}) => (
    <label className="block"><span className="text-sm">{label}</span><input className={`${field} mt-1`} type={o.type ?? "text"} value={a[k]} placeholder={o.ph} autoComplete="off" onChange={(e) => up({ [k]: e.target.value.trim() })} /></label>
  );
  return (
    <div className="space-y-4">
      <NeonCard>
        <p className="font-medium">1. Put Command alerts in OBS</p>
        <p className={`${hint} mt-1`}>Sounds, pop-ups and the other apps all go through this one overlay. Add it as a Browser source, 1920 × 1080, on every scene (or a scene you nest in all of them).</p>
        <div className="flex gap-2 mt-3">
          <input className={`${field} font-mono text-xs`} readOnly value={obsLink.replace(/(lumia|obs)=[^&]+/g, "$1=••••")} aria-label="OBS link" />
          <Copy text={obsLink} />
        </div>
        <p className={`${hint} mt-2`}>
          The passwords below go after the # in this link. That part never leaves your PC, and Spartacus doesn&apos;t keep them; this browser remembers them for you. Changed one? Copy the link again and paste it into the Browser source.
        </p>
        <p className={`${hint} mt-1`}>
          <Link href={`/dashboard/${guildId}/overlays/cmdfx`} className="text-neon-blue underline">Change how the pop-ups look</Link>
        </p>
      </NeonCard>

      <NeonCard>
        <p className="font-medium">2. The apps you use (fill in only those)</p>
        <div className="grid sm:grid-cols-2 gap-4 mt-3">
          <div className="space-y-2">
            <p className="text-sm font-semibold">Lumia Stream</p>
            <p className={hint}>In Lumia: Settings › API. Turn it on and copy the token.</p>
            {inp("Lumia token", "lumia", { type: "password", ph: "Paste your token" })}
            {inp("Port (leave as is)", "lumiaport")}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold">Streamer.bot</p>
            <p className={hint}>In Streamer.bot: Servers/Clients › WebSocket Server › Start. Leave its password off.</p>
            {inp("WebSocket port", "sbport")}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold">OBS</p>
            <p className={hint}>In OBS: Tools › WebSocket Server Settings › Enable. Show Connect Info gives the password.</p>
            {inp("WebSocket password", "obs", { type: "password", ph: "From Show Connect Info" })}
            {inp("Port (leave as is)", "obsport")}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold">Then</p>
            <p className={hint}>Edit a command › Also send to: pick the app and type the name of the command, alert, action, scene or source there. Then press Copy above and paste the new link into OBS.</p>
          </div>
        </div>
      </NeonCard>

      <NeonCard>
        <p className="font-medium">3. Run a command from another app (optional)</p>
        <p className={`${hint} mt-1`}>
          Lumia, Streamer.bot (Fetch URL), a Stream Deck (Website or Spartacus key) or anything that can open a link can run a command without anyone typing it. It replies in chat and plays the sound and pop-up, like a real one.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 mt-3">
          <select className={`${field} sm:w-44 font-mono`} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Command">
            {cfg.cmds.map((c) => <option key={c.id} value={c.name}>!{c.name}</option>)}
          </select>
          <input className={`${field} font-mono text-xs`} readOnly value={pick ? run(pick, "Link") : ""} aria-label="Run link" />
          {pick && <Copy text={run(pick, "Link")} />}
        </div>
        <p className={`${hint} mt-2`}>Add &amp;args=2 to the end to pass words, like !need 2. Keep these links private: anyone with one can run your commands.</p>
        <button
          className={`${button} mt-3`}
          onClick={async () => {
            if (!sure) { setSure(true); setTimeout(() => setSure(false), 4000); return; }
            setSure(false);
            const r = await api.newChatCommandsKey(guildId).catch(() => null);
            if (r) onKey(r.config);
          }}
        >
          {sure ? "Tap again: every old link stops working" : "Make new links (stops the old ones)"}
        </button>
      </NeonCard>
    </div>
  );
}

// ---- Counts (like !death) and quotes ----
function Counts({ guildId, cfg }: { guildId: string; cfg: ChatCommandsConfig }) {
  const [st, setSt] = useState<ChatCommandsData["state"] | null>(null);
  const [quote, setQuote] = useState("");
  const status = useAutoSave(st, async () => { if (st) await api.saveChatCommandsState(guildId, st); });
  // Fresh numbers each time the tab opens (chat changes them).
  useEffect(() => {
    api.getChatCommands(guildId).then((d) => setSt(d.state)).catch(() => setSt({ counts: {}, quotes: [] }));
  }, [guildId]);
  if (!st) return <p className="text-slate-400">Loading…</p>;
  const counted = cfg.cmds.filter((c) => /\{count\}/.test(c.reply + c.atext) || c.ov === "win" || c.ov === "loss" || st.counts[c.id]);
  return (
    <div className="space-y-4">
      <NeonCard>
        <div className="flex items-center justify-between gap-2"><p className="font-medium">Counts</p><SaveStatus status={status} /></div>
        <p className={`${hint} mt-1`}>Commands with {"{count}"} in them count each use, like !death. Fix or reset them here.</p>
        <div className="space-y-1.5 mt-3">
          {counted.length === 0 && <p className={hint}>None of your commands count anything.</p>}
          {counted.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-lg border border-white/10 p-2">
              <span className="font-mono text-sm text-neon-blue flex-1 min-w-0 truncate">!{c.name}</span>
              <button className={`${button} !py-1`} onClick={() => setSt({ ...st, counts: { ...st.counts, [c.id]: Math.max(0, (st.counts[c.id] ?? 0) - 1) } })} aria-label={`!${c.name} minus 1`}>−</button>
              <input type="number" min={0} className={`${field} !w-20 text-center tabular-nums`} value={st.counts[c.id] ?? 0} onChange={(e) => setSt({ ...st, counts: { ...st.counts, [c.id]: Math.max(0, Number(e.target.value) || 0) } })} aria-label={`!${c.name} count`} />
              <button className={`${button} !py-1`} onClick={() => setSt({ ...st, counts: { ...st.counts, [c.id]: (st.counts[c.id] ?? 0) + 1 } })} aria-label={`!${c.name} plus 1`}>+</button>
              <button className={`${button} !py-1`} onClick={() => setSt({ ...st, counts: { ...st.counts, [c.id]: 0 } })}>Reset</button>
            </div>
          ))}
        </div>
      </NeonCard>
      <NeonCard>
        <p className="font-medium">Quotes ({st.quotes.length})</p>
        <p className={`${hint} mt-1`}>Mods add them in chat with !addquote. !quote picks one at random, !quote 3 picks number 3.</p>
        <div className="flex gap-2 mt-3">
          <input className={field} value={quote} maxLength={300} placeholder="Add a quote" onChange={(e) => setQuote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && quote.trim()) { setSt({ ...st, quotes: [...st.quotes, quote.trim()] }); setQuote(""); } }} />
          <button className="neon-button shrink-0" disabled={!quote.trim()} onClick={() => { setSt({ ...st, quotes: [...st.quotes, quote.trim()] }); setQuote(""); }}>Add</button>
        </div>
        <ol className="space-y-1 mt-3 max-h-80 overflow-y-auto">
          {st.quotes.map((q, i) => (
            <li key={`${i}-${q}`} className="flex items-start gap-2 text-sm rounded-lg border border-white/10 px-2.5 py-1.5">
              <span className="text-slate-500 tabular-nums shrink-0">#{i + 1}</span>
              <span className="flex-1 min-w-0 break-words">{q}</span>
              <button className="text-rose-300 text-xs shrink-0" onClick={() => setSt({ ...st, quotes: st.quotes.filter((_, k) => k !== i) })}>Remove</button>
            </li>
          ))}
        </ol>
      </NeonCard>
    </div>
  );
}
