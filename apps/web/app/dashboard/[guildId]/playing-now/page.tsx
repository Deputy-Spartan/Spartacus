"use client";

import { useEffect, useState } from "react";
import { PLAYING_NOW_DURATIONS, PLAYING_NOW_MAX_MODES, type PlayingNowSettings } from "@spartacus/shared";
import { api, type PlayingNowView } from "../../../../lib/api";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { FormError } from "../../../../components/ui/FormError";

const inputClass = "w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm";

function Chips<T extends number>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => onChange(v)} className={`rounded-lg border px-3 py-1.5 text-sm ${value === v ? "border-neon-blue bg-neon-blue/10 text-neon-blue" : "border-white/10 text-slate-300 hover:border-white/25"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Step({ n, title, desc, children }: { n: number; title: string; desc: string; children: React.ReactNode }) {
  return (
    <NeonCard>
      <div className="flex gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-neon-blue/15 text-sm text-neon-blue">{n}</span>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="font-medium">{title}</p>
            <p className="text-sm text-slate-400">{desc}</p>
          </div>
          {children}
        </div>
      </div>
    </NeonCard>
  );
}

export default function PlayingNowPage({ params }: { params: { guildId: string } }) {
  const guildId = params.guildId;
  const [view, setView] = useState<PlayingNowView | null>(null);
  const [d, setD] = useState<PlayingNowSettings | null>(null);
  const [modeDraft, setModeDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getPlayingNow(guildId)
      .then((v) => {
        setView(v);
        setD(v.settings);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load."));
  }, [guildId]);

  if (!view || !d) return <p className="text-slate-400">{error ?? "Loading…"}</p>;
  const set = (patch: Partial<PlayingNowSettings>) => setD({ ...d, ...patch });

  async function save(next = d!) {
    setBusy(true);
    setError(null);
    try {
      const v = await api.savePlayingNow(guildId, next);
      setView(v);
      setD(v.settings);
      setNotice(v.panelError ? null : v.settings.channelId ? "Saved. The panel is up in your channel." : "Saved.");
      if (v.panelError) setError(v.panelError);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  async function makeRoles() {
    setBusy(true);
    setError(null);
    try {
      const v = await api.makePlayingNowRoles(guildId);
      setView(v);
      setD({ ...d!, roleId: v.settings.roleId, notifyRoleId: v.settings.notifyRoleId });
      setNotice("Roles ready: 🎮 Playing Now and 🔔 Play Notify.");
      if (v.panelError) setError(v.panelError);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make the roles.");
    } finally {
      setBusy(false);
    }
  }

  const addMode = () => {
    const m = modeDraft.replace(/\s+/g, " ").trim().slice(0, 40);
    if (!m || d.modes.some((x) => x.toLowerCase() === m.toLowerCase()) || d.modes.length >= PLAYING_NOW_MAX_MODES) return;
    set({ modes: [...d.modes, m] });
    setModeDraft("");
  };

  return (
    <div className="space-y-4">
      <ModuleHeader guildId={guildId} moduleKey="PLAYING_NOW" title="Playing Now" description="A one-tap “I'm on, who wants to play?” Members get a role and a post others can join, and it clears itself." />

      {view.active.length > 0 && (
        <NeonCard>
          <p className="font-medium mb-2">🎮 On right now ({view.active.length})</p>
          <div className="divide-y divide-white/5 text-sm">
            {view.active.map((p) => (
              <div key={p.userId} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span>
                  <b>{p.name}</b> · {p.mode}
                  {p.note ? <span className="text-slate-500"> · {p.note}</span> : null}
                </span>
                <span className="text-xs text-slate-500">
                  {p.joined}/{p.need} joined · ends {new Date(p.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </NeonCard>
      )}

      <Step n={1} title="Pick the channel" desc="Spartacus posts a panel with the I'm on now button. Posts go under it and the panel moves back to the bottom each time.">
        <ChannelSelect guildId={guildId} value={d.channelId} onChange={(id) => set({ channelId: id || null })} placeholder="Pick a channel, like #playing-now" />
        {view.posted && <p className="text-xs text-emerald-400">✓ The panel is posted.</p>}
      </Step>

      <Step n={2} title="The roles" desc="Playing Now is shown in its own group at the top of the member list, so people see who's on. Notify is opt-in: members tap Notify me to get pinged.">
        <button type="button" disabled={busy} onClick={makeRoles} className="neon-button-sm disabled:opacity-40">
          Make the roles for me
        </button>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-sm text-slate-300">Playing Now role</p>
            <RoleSelect guildId={guildId} value={d.roleId} onChange={(id) => set({ roleId: id || null })} placeholder="No role" />
            <p className="mt-1 text-xs text-slate-500">Turn on “Display separately” in Server Settings if you pick your own.</p>
          </div>
          <div>
            <p className="mb-1 text-sm text-slate-300">Notify role (optional)</p>
            <RoleSelect guildId={guildId} value={d.notifyRoleId} onChange={(id) => set({ notifyRoleId: id || null })} placeholder="No pings" />
            <p className="mt-1 text-xs text-slate-500">Spartacus's role must sit above both.</p>
          </div>
        </div>
      </Step>

      <Step n={3} title="Timing" desc="How long a post can last, how often Notify pings, and whether leaving voice ends it.">
        <div>
          <p className="mb-1 text-sm text-slate-300">Longest a post can last</p>
          <Chips value={d.maxMinutes} options={PLAYING_NOW_DURATIONS.map((m) => [m, m === 120 ? "2 hours" : m === 60 ? "1 hour" : `${m} min`] as [number, string])} onChange={(maxMinutes) => set({ maxMinutes })} />
          <p className="mt-1 text-xs text-slate-500">Members pick 30 min, 1 hour or 2 hours, up to this. They can add 30 minutes with a button.</p>
        </div>
        <div>
          <p className="mb-1 text-sm text-slate-300">Ping Notify at most once every</p>
          <Chips value={d.pingCooldown} options={[10, 20, 30, 60].map((m) => [m, `${m} min`] as [number, string])} onChange={(pingCooldown) => set({ pingCooldown })} />
        </div>
        <label className="flex items-start justify-between gap-3">
          <span>
            <span className="text-sm text-slate-300">End it when they leave voice for 10 minutes</span>
            <span className="block text-xs text-slate-500">Only once they've been in voice, so nobody is cut off before they join.</span>
          </span>
          <ToggleSwitch enabled={d.endOnVoiceLeave} onChange={(endOnVoiceLeave) => set({ endOnVoiceLeave })} />
        </label>
      </Step>

      <Step n={4} title="Extras" desc="The modes members pick from, and a shortcut to Matchmaking when lots of people are on.">
        <div>
          <p className="mb-1 text-sm text-slate-300">Game modes</p>
          <div className="flex flex-wrap gap-1.5">
            {d.modes.map((m) => (
              <span key={m} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-sm">
                {m}
                {d.modes.length > 1 && (
                  <button type="button" aria-label={`Remove ${m}`} className="text-slate-500 hover:text-rose-400" onClick={() => set({ modes: d.modes.filter((x) => x !== m) })}>
                    ✕
                  </button>
                )}
              </span>
            ))}
          </div>
          {d.modes.length < PLAYING_NOW_MAX_MODES && (
            <div className="mt-2 flex gap-2">
              <input className={inputClass} value={modeDraft} maxLength={40} placeholder="Add a mode, like Scrims" onChange={(e) => setModeDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addMode())} />
              <button type="button" className="neon-button-sm" onClick={addMode}>
                Add
              </button>
            </div>
          )}
        </div>
        <label className="flex items-start justify-between gap-3">
          <span>
            <span className="text-sm text-slate-300">Show a Queue in Matchmaking button when 5+ people are on</span>
            <span className="block text-xs text-slate-500">Links to your Matchmaking board, if it's set up.</span>
          </span>
          <ToggleSwitch enabled={d.matchmakingButton} onChange={(matchmakingButton) => set({ matchmakingButton })} />
        </label>
      </Step>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} className="neon-button-sm disabled:opacity-40" onClick={() => save()}>
          Save
        </button>
        {notice && <span className="text-xs text-emerald-400">{notice}</span>}
      </div>
      <FormError message={error} />
    </div>
  );
}
