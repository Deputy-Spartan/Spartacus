"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../ui/NeonCard";
import { ChannelSelect } from "../ui/ChannelSelect";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { api, type CommandListSettingsRow } from "../../lib/api";

const label = "text-xs uppercase tracking-wide text-slate-500 block mb-2";
const hint = "text-xs text-slate-500";

// Custom Commands › Command list post: every command, posted in Discord and
// kept up to date. One row per card: the 🔒 Staff commands row (staff commands
// from every category) and one row per category, each turned on or off and
// sent to its own channel. Each command is a tappable Discord command, so a tap
// (on PC or phone) puts it straight into the message box.
//
// Stored as: staffChannelId + includeStaff (the staff row), sections[name]
// (each category's on/off and channel), and channelId, the channel a category
// uses until it's given its own ("Set every category to" sets it).
export function CommandListPost({ guildId }: { guildId: string }) {
  const [s, setS] = useState<CommandListSettingsRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [allKey, setAllKey] = useState(0);

  useEffect(() => {
    api.getCommandList(guildId).then(setS).catch(() => setMsg({ ok: false, text: "Couldn't load the settings." }));
  }, [guildId]);

  async function save(patch: Partial<CommandListSettingsRow>) {
    if (!s) return;
    setS({ ...s, ...patch });
    setBusy(true);
    try {
      const r = await api.saveCommandList(guildId, patch);
      setS(r);
      setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: r.pending ? "✓ Saved. Discord is updating (safe to leave this page)." : r.posted ? "✓ Saved. Discord matches." : "✓ Saved." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't save." });
    } finally {
      setBusy(false);
    }
  }

  async function postNow() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.postCommandList(guildId);
      setS(r);
      setMsg({ ok: true, text: r.pending ? "✓ Started. Discord is updating (safe to leave this page)." : "✓ Posted. Everything is up to date." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't post the list." });
    } finally {
      setBusy(false);
    }
  }

  // One category's on/off or channel; the rest stay as they are.
  function saveSection(name: string, patch: { on?: boolean; channelId?: string | null }) {
    if (!s) return;
    const prev = s.sections?.[name] ?? {};
    void save({ sections: { ...(s.sections ?? {}), [name]: { on: prev.on !== false, channelId: prev.channelId ?? null, ...patch } } });
  }

  // Every category into one channel (each keeps its on/off).
  function setAll(channelId: string) {
    if (!s || !channelId) return;
    const sections = Object.fromEntries((s.sectionList ?? []).map((sec) => [sec.name, { on: s.sections?.[sec.name]?.on !== false, channelId: null }]));
    void save({ channelId, sections });
    setAllKey((k) => k + 1);
  }

  if (!s) return <p className="text-slate-400">{msg?.text ?? "Loading…"}</p>;

  const list = s.sectionList ?? [];
  const staffTotal = list.reduce((n, sec) => n + (sec.count ?? 0), 0);
  const staffOn = s.includeStaff;
  const anyChannel = !!s.channelId || !!s.staffChannelId || Object.values(s.sections ?? {}).some((x) => x?.channelId);

  const setting = (title: string, text: string, key: "autoUpdate" | "includeCustom" | "onlyEnabled") => (
    <div className="flex items-center justify-between gap-4 py-3 border-t border-white/5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className={hint}>{text}</p>
      </div>
      <ToggleSwitch enabled={s[key]} onChange={(v) => save({ [key]: v })} label={title} />
    </div>
  );

  return (
    <div className="space-y-4 max-w-3xl">
      <NeonCard>
        <p className="font-medium mb-1">📢 Command list post</p>
        <p className={`${hint} mb-4`}>
          Each row below is one card in Discord. Turn it on or off and pick where it goes. Every command is tappable: tapping it (on PC or phone) puts it in the
          message box, ready to send. When a command is added or removed, only its card is edited.
        </p>

        <div className="rounded-lg border border-white/10 bg-base-950/60 p-3 mb-4">
          <label className={label}>Set every category to</label>
          <ChannelSelect key={allKey} guildId={guildId} value={null} onChange={(id) => id && setAll(id)} kind="text" placeholder="Pick a channel…" />
          <p className={`${hint} mt-1`}>Puts every category in one channel. You can still move single ones below. The 🔒 Staff row isn&apos;t changed.</p>
        </div>

        {/* The staff row: staff commands from every category, in their own channel. */}
        <div className={`rounded-lg border p-3 mb-2 ${staffOn ? "border-rose-500/30 bg-rose-500/5" : "border-white/10"}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className={`text-sm font-medium ${staffOn ? "" : "text-slate-500 line-through"}`}>🔒 Staff list: every command</p>
              <p className={hint}>{staffTotal ? `All ${staffTotal} commands, staff-only ones marked STAFF · ` : ""}only staff should see this channel</p>
            </div>
            <ToggleSwitch enabled={staffOn} onChange={(v) => save({ includeStaff: v })} label="Post staff commands" />
          </div>
          <div className={`mt-2 ${staffOn ? "" : "opacity-40 pointer-events-none"}`}>
            <ChannelSelect guildId={guildId} value={s.staffChannelId} onChange={(id) => save({ staffChannelId: id || null })} kind="text" placeholder="Pick a staff-only channel…" />
          </div>
          {staffOn && !s.staffChannelId && <p className="text-xs text-amber-400 mt-1">Pick a channel, or staff commands won&apos;t be posted anywhere.</p>}
        </div>
        <p className={`${hint} mb-2`}>The 🔒 channel always shows every command. Staff-only commands never show in the member cards below.</p>

        <div className="divide-y divide-white/5">
          {list.map((sec) => {
            const cfg = s.sections?.[sec.name] ?? {};
            const on = cfg.on !== false;
            const members = sec.count === undefined ? null : sec.count - (sec.staffCount ?? 0);
            const channel = cfg.channelId ?? s.channelId ?? null;
            return (
              <div key={sec.name} className="py-3 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] gap-2 sm:gap-4 items-center">
                <div className="flex items-center justify-between gap-3 min-w-0">
                  <div className="min-w-0">
                    <p className={`text-sm font-medium truncate ${on ? "" : "text-slate-500 line-through"}`}>
                      {sec.emoji} {sec.name}
                    </p>
                    <p className={hint}>
                      {members === null ? "" : members === 0 ? "No member commands right now" : `${members} command${members === 1 ? "" : "s"}`}
                      {sec.staffCount ? ` · +${sec.staffCount} staff-only (in 🔒)` : ""}
                    </p>
                  </div>
                  <ToggleSwitch enabled={on} onChange={(v) => saveSection(sec.name, { on: v })} label={`Post ${sec.name}`} />
                </div>
                <div className={`min-w-0 ${on ? "" : "opacity-40 pointer-events-none"}`}>
                  <ChannelSelect guildId={guildId} value={channel} onChange={(id) => saveSection(sec.name, { channelId: id || null })} kind="text" placeholder="Pick a channel…" />
                </div>
              </div>
            );
          })}
        </div>
        {!list.length && <p className={hint}>The bot isn&apos;t connected, so the categories can&apos;t be listed right now.</p>}
      </NeonCard>

      <NeonCard>
        <span className={label}>Style</span>
        <div className="flex gap-2">
          {(["EMBED", "PLAIN"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={s.style === v} onClick={() => save({ style: v })} className={`sp-metal flex-1 px-3 py-2.5 rounded-lg text-sm font-semibold ${s.style === v ? "is-active" : ""}`}>
              {v === "EMBED" ? "🎨 Embed" : "💬 Plain message"}
            </button>
          ))}
        </div>
        <p className={`${hint} mt-1 mb-2`}>{s.style === "EMBED" ? "A colored card per category." : "A heading and list per category."}</p>
        {setting("Update by itself", "When a command is added, changed or removed (or a module is turned on or off), the cards are edited to match. No new posts.", "autoUpdate")}
        {setting("Include your custom commands", "The /commands and !triggers made on this page (the ⭐ row).", "includeCustom")}
        {setting("Only modules that are on", "Leave out commands from modules you've turned off.", "onlyEnabled")}
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <button className="neon-button" disabled={busy || !anyChannel} onClick={postNow}>
            {busy ? "Working…" : s.posted ? "Update everything now" : "Post the lists"}
          </button>
          {msg && <span className={`text-xs ${msg.ok ? "text-emerald-400" : "text-rose-400"}`}>{msg.text}</span>}
        </div>
        <p className={`${hint} mt-3`}>Moving a row to another channel removes its old card and posts it in the new place.</p>
      </NeonCard>
    </div>
  );
}
