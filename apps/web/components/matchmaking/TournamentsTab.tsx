"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  TOURNAMENT_BEST_OF,
  TOURNAMENT_DEFAULTS,
  TOURNAMENT_SIZES,
  TOURNAMENT_STATUS,
  roundName,
  tieBestOf,
  type TournamentInput,
} from "@spartacus/shared";
import { api, type TournamentRow, type TournamentsView } from "../../lib/api";
import { NeonCard } from "../ui/NeonCard";
import { ChannelSelect } from "../ui/ChannelSelect";
import { RoleSelect } from "../ui/RoleSelect";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { FormError } from "../ui/FormError";
import { DateTimeZoneField } from "../ui/DateTimeZoneField";
import { useConfirm } from "../ui/ConfirmDialog";

// Matchmaking → Tournaments: make a tournament, open registration, and watch
// (or steer) the bracket. Teams register in Discord with their Matchmaking team.

const inputClass = "w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm";
const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-slate-500/15 text-slate-300",
  OPEN: "bg-sky-500/15 text-sky-300",
  CHECKIN: "bg-emerald-500/15 text-emerald-300",
  LIVE: "bg-rose-500/15 text-rose-300",
  DONE: "bg-amber-500/15 text-amber-300",
  CANCELED: "bg-slate-600/15 text-slate-500",
};
const NEXT_STEP: Record<string, string> = {
  DRAFT: "Not posted yet. Open registration to post it in Discord so captains can register their teams.",
  OPEN: "Captains are registering with Register my team. It moves on by itself at the start time, or start it yourself.",
  CHECKIN: "Captains are checking in. Teams that don't are taken out when check-in closes, then the bracket starts.",
  LIVE: "Matches are running in their own threads. Winners move on by themselves; use Set winner for a no-show or dispute.",
  DONE: "Finished. Run it again to make next week's with the same settings.",
  CANCELED: "Canceled.",
};

function Chips<T extends string | number>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, label]) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-lg border px-3 py-1.5 text-sm ${value === v ? "border-neon-blue bg-neon-blue/10 text-neon-blue" : "border-white/10 text-slate-300 hover:border-white/25"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm text-slate-300">{label}</p>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function TournamentForm({ guildId, view, start, onSave, onCancel }: { guildId: string; view: TournamentsView; start: TournamentInput & { id?: string; status?: string }; onSave: (t: TournamentInput, id?: string) => Promise<void>; onCancel: () => void }) {
  const [d, setD] = useState(start);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<TournamentInput>) => setD((x) => ({ ...x, ...patch }));
  const size = view.games.find((g) => g.game === d.game)?.teamSize ?? 5;
  const open = start.status === "OPEN";
  const num = (key: "winCoins" | "championCoins" | "runnerUpCoins") => ({
    type: "number",
    min: 0,
    className: inputClass,
    value: d[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set({ [key]: Math.max(0, Math.round(Number(e.target.value) || 0)) }),
  });
  return (
    <NeonCard>
      <p className="font-medium mb-4">{start.id ? `Edit ${start.name}` : "New tournament"}</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-4">
          <Field label="Name">
            <input className={inputClass} value={d.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} placeholder="Saturday Cup" />
          </Field>
          <Field label="Game" hint={open ? "The game can't change once registration is open." : `Teams play ${size}v${size}, from the team size on the Games tab.`}>
            <select className={inputClass} value={d.game} disabled={open} onChange={(e) => set({ game: e.target.value })}>
              <option value="">Pick a game</option>
              {view.games.map((g) => (
                <option key={g.game} value={g.game}>
                  {g.game} ({g.teamSize}v{g.teamSize})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Most teams" hint="Any number up to this can play. Top seeds get a free pass (a bye) when it isn't a full bracket.">
            <Chips value={d.maxTeams} options={TOURNAMENT_SIZES.map((n) => [n, String(n)] as [number, string])} onChange={(maxTeams) => set({ maxTeams })} />
          </Field>
          <Field label="Matches">
            <Chips value={d.bestOf} options={Object.entries(TOURNAMENT_BEST_OF) as Array<[TournamentInput["bestOf"], string]>} onChange={(bestOf) => set({ bestOf })} />
          </Field>
          <Field label="Seeding" hint="By record uses each team's Matchmaking wins, so the two best teams can only meet in the final.">
            <Chips value={d.seeding} options={[["RECORD", "By match record"], ["RANDOM", "Random draw"]]} onChange={(seeding) => set({ seeding })} />
          </Field>
          <Field label="Start time" hint="Optional. With a time it runs by itself (check-in, then the bracket). Without one, you start it from here.">
            <DateTimeZoneField value={d.startAt ?? ""} onChange={(iso) => set({ startAt: iso || null })} clearable />
          </Field>
        </div>
        <div className="space-y-4">
          <label className="flex items-start justify-between gap-3">
            <span>
              <span className="text-sm text-slate-300">Check-in before it starts</span>
              <span className="block text-xs text-slate-500">Captains tap Check in; no-shows are taken out before the bracket is made.</span>
            </span>
            <ToggleSwitch enabled={d.checkIn} onChange={(checkIn) => set({ checkIn })} />
          </label>
          {d.checkIn && (
            <Field label="Check-in opens">
              <Chips value={d.checkInMinutes} options={[5, 10, 15, 30].map((n) => [n, `${n} min before`] as [number, string])} onChange={(checkInMinutes) => set({ checkInMinutes })} />
            </Field>
          )}
          <label className="flex items-start justify-between gap-3">
            <span>
              <span className="text-sm text-slate-300">Solo sign-ups</span>
              <span className="block text-xs text-slate-500">Players without a team can sign up and are put into teams at the start (topped up from Looking for a Team).</span>
            </span>
            <ToggleSwitch enabled={d.soloSignups} onChange={(soloSignups) => set({ soloSignups })} />
          </label>
          <Field label="Channel for the tournament post" hint={view.defaultChannelId ? "Leave empty to use the Matchmaking channel." : "Pick where registration and the bracket post."}>
            <ChannelSelect guildId={guildId} value={d.channelId} onChange={(id) => set({ channelId: id || null })} placeholder={view.defaultChannelId ? "Matchmaking channel" : "Pick a channel"} />
          </Field>
          <Field label="Role to ping when registration opens (optional)">
            <RoleSelect guildId={guildId} value={d.pingRoleId} onChange={(id) => set({ pingRoleId: id || null })} placeholder="No ping" />
          </Field>
          <Field label="Rules (optional)" hint="Shown on the post while registration and check-in are open.">
            <textarea className={`${inputClass} min-h-20`} maxLength={1000} value={d.rules} onChange={(e) => set({ rules: e.target.value })} placeholder="10 min late = forfeit. Captains report scores. Disputes go to staff." />
          </Field>
          <div className="rounded-lg border border-white/10 p-3 space-y-3">
            <p className="text-sm font-medium">Rewards</p>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Per match win">
                <input {...num("winCoins")} />
              </Field>
              <Field label="Champions">
                <input {...num("championCoins")} />
              </Field>
              <Field label="Runner-up">
                <input {...num("runnerUpCoins")} />
              </Field>
            </div>
            <p className="text-xs text-slate-500">Coins each, for every player. Coins need the Economy Hub turned on.</p>
            <Field label="Champion role (for a week)" hint={view.championRoleId ? "Leave empty to use the Matchmaking Champion role." : undefined}>
              <RoleSelect guildId={guildId} value={d.championRoleId} onChange={(id) => set({ championRoleId: id || null })} placeholder={view.championRoleId ? "Matchmaking Champion role" : "No role"} />
            </Field>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-5">
        <button
          type="button"
          disabled={saving}
          className="neon-button-sm disabled:opacity-40"
          onClick={async () => {
            setSaving(true);
            await onSave(d, start.id);
            setSaving(false);
          }}
        >
          {start.id ? "Save" : "Create tournament"}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-slate-400 hover:text-white px-2">
          Cancel
        </button>
      </div>
    </NeonCard>
  );
}

function Bracket({ guildId, t, view, onWinner }: { guildId: string; t: TournamentRow; view: TournamentsView; onWinner: (r: number, i: number, side: "a" | "b") => void }) {
  const entry = (id: string | null) => t.entries.find((e) => e.id === id);
  const room = (id: string | null) => view.rooms.find((r) => r.id === id);
  if (!t.bracket.length) return null;
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {t.bracket.map((ties, r) => (
        <div key={r} className="flex min-w-[210px] flex-col justify-around gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {roundName(t.bracket, r)} <span className="text-amber-300">BO{tieBestOf(t.bestOf, t.bracket, r)}</span>
          </p>
          {ties.map((tie, i) => {
            const live = !!tie.a && !!tie.b && !tie.w;
            const liveRoom = room(tie.roomId);
            const line = (id: string | null, score: number | null) => {
              const e = entry(id);
              const won = !!tie.w && tie.w === id;
              const lost = !!tie.w && !!id && tie.w !== id;
              return (
                <div className={`grid grid-cols-[22px_1fr_auto] items-center gap-2 px-2.5 py-1.5 text-sm ${won ? "font-semibold text-white" : lost ? "text-slate-500 line-through" : "text-slate-300"}`}>
                  <span className="rounded bg-white/5 text-center text-[10px] text-slate-400">{e?.seed ?? ""}</span>
                  <span className="truncate">{e ? e.name : <i className="text-slate-600">{r === 0 ? "bye" : "TBD"}</i>}</span>
                  <span className={won ? "text-emerald-300" : ""}>{tie.forfeit ? (won ? "W" : "") : score ?? ""}</span>
                </div>
              );
            };
            return (
              <div key={i} className={`overflow-hidden rounded-lg border ${live ? "border-rose-500/50" : "border-white/10"} bg-base-950`}>
                {line(tie.a, tie.sa)}
                <div className="border-t border-white/5" />
                {line(tie.b, tie.sb)}
                {live && t.status === "LIVE" && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-white/5 px-2.5 py-1.5 text-xs">
                    <span className="text-rose-300">● Live</span>
                    {liveRoom?.threadId && (
                      <a className="text-neon-blue hover:underline" href={`https://discord.com/channels/${guildId}/${liveRoom.threadId}`} target="_blank" rel="noreferrer">
                        Thread
                      </a>
                    )}
                    <span className="ml-auto text-slate-500">Set winner:</span>
                    <button type="button" className="text-slate-300 hover:text-white" onClick={() => onWinner(r, i, "a")}>
                      {entry(tie.a)?.name.slice(0, 12)}
                    </button>
                    <button type="button" className="text-slate-300 hover:text-white" onClick={() => onWinner(r, i, "b")}>
                      {entry(tie.b)?.name.slice(0, 12)}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const toInput = (t: TournamentRow): TournamentInput & { id: string; status: string } => ({
  id: t.id,
  status: t.status,
  name: t.name,
  game: t.game,
  maxTeams: t.maxTeams,
  bestOf: t.bestOf,
  seeding: t.seeding,
  checkIn: t.checkIn,
  checkInMinutes: t.checkInMinutes,
  soloSignups: t.soloSignups,
  startAt: t.startAt,
  channelId: t.channelId,
  pingRoleId: t.pingRoleId,
  rules: t.rules ?? "",
  winCoins: t.winCoins,
  championCoins: t.championCoins,
  runnerUpCoins: t.runnerUpCoins,
  championRoleId: t.championRoleId,
});

export function TournamentsTab({ guildId }: { guildId: string }) {
  const confirm = useConfirm();
  const [view, setView] = useState<TournamentsView | null>(null);
  const [form, setForm] = useState<(TournamentInput & { id?: string; status?: string }) | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getTournaments(guildId).then(setView).catch((e) => setError(e instanceof Error ? e.message : "Couldn't load tournaments."));
  }, [guildId]);
  // A live bracket keeps itself fresh.
  const anyLive = view?.tournaments.some((t) => t.status === "LIVE" || t.status === "CHECKIN" || t.status === "OPEN");
  useEffect(() => {
    if (!anyLive) return;
    const timer = setInterval(() => api.getTournaments(guildId).then(setView).catch(() => null), 20_000);
    return () => clearInterval(timer);
  }, [guildId, anyLive]);

  async function run(action: () => Promise<TournamentsView>, done: string) {
    setBusy(true);
    setError(null);
    try {
      setView(await action());
      setNotice(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  if (!view) return <p className="text-sm text-slate-400">{error ?? "Loading…"}</p>;
  const name = (id: string) => view.names[id] ?? id;

  if (form)
    return (
      <div className="space-y-3">
        <FormError message={error} />
        <TournamentForm
          guildId={guildId}
          view={view}
          start={form}
          onCancel={() => setForm(null)}
          onSave={async (t, id) => {
            setError(null);
            try {
              const next = id ? await api.updateTournament(guildId, id, t) : await api.createTournament(guildId, t);
              setView(next);
              setForm(null);
              setSelectedId(id ?? next.tournaments[0]?.id ?? null);
              setNotice(id ? "Saved." : "Created. Open registration when you're ready to post it.");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Couldn't save.");
            }
          }}
        />
      </div>
    );

  if (!view.matchmakingReady || !view.games.length)
    return (
      <NeonCard>
        <p className="font-medium mb-1">Set up Matchmaking first</p>
        <p className="text-sm text-slate-400">Tournaments use your Matchmaking games and teams. Add a game on the Games tab and set up the Matchmaking tab, then come back here.</p>
      </NeonCard>
    );

  const current = view.tournaments.filter((t) => t.status !== "DONE" && t.status !== "CANCELED");
  const past = view.tournaments.filter((t) => t.status === "DONE" || t.status === "CANCELED");
  const selected = view.tournaments.find((t) => t.id === selectedId) ?? current[0] ?? null;
  const champions = view.tournaments.filter((t) => t.status === "DONE" && t.championEntryId);

  const act = async (t: TournamentRow, action: "open" | "checkin" | "start" | "cancel" | "duplicate", done: string, ask?: string) => {
    if (ask && !(await confirm(ask))) return;
    await run(() => api.tournamentAction(guildId, t.id, action), done);
  };

  return (
    <div className="space-y-5">
      <NeonCard>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium">🏆 Tournaments</p>
            <p className="text-xs text-slate-500">Brackets for the teams people already made in Matchmaking.</p>
          </div>
          <button type="button" className="neon-button-sm" onClick={() => setForm({ ...TOURNAMENT_DEFAULTS, game: view.games[0]?.game ?? "" })}>
            + New tournament
          </button>
        </div>
        <ol className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-4">
          {[
            ["1", "Create it", "Name, game, size, start time."],
            ["2", "Open registration", "Captains tap Register my team; solo players sign up."],
            ["3", "Check-in", "15 min before, captains check in. No-shows are removed."],
            ["4", "It runs itself", "Every round plays at once; captains report; a champion is crowned."],
          ].map(([n, title, text]) => (
            <li key={n} className="rounded-lg border border-white/10 p-3">
              <span className="mr-1.5 inline-grid h-5 w-5 place-items-center rounded-full bg-neon-blue/15 text-[11px] text-neon-blue">{n}</span>
              <b className="font-medium">{title}</b>
              <p className="mt-1 text-xs text-slate-500">{text}</p>
            </li>
          ))}
        </ol>
      </NeonCard>

      {notice && <p className="text-xs text-emerald-400">{notice}</p>}
      <FormError message={error} />

      {current.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {current.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedId(t.id)}
              className={`rounded-lg border px-3 py-2 text-left text-sm ${selected?.id === t.id ? "border-neon-blue bg-neon-blue/5" : "border-white/10 hover:border-white/25"}`}
            >
              <span className="block font-medium">{t.name}</span>
              <span className={`mt-1 inline-block rounded px-1.5 text-[11px] ${STATUS_STYLE[t.status]}`}>{TOURNAMENT_STATUS[t.status]}</span>
              <span className="ml-2 text-xs text-slate-500">
                {t.game} · {t.entries.filter((e) => !e.out).length}/{t.maxTeams} teams
              </span>
            </button>
          ))}
        </div>
      )}

      {current.length === 0 && !selected && (
        <NeonCard>
          <p className="py-4 text-center text-sm text-slate-500">No tournament running. Make one with + New tournament.</p>
        </NeonCard>
      )}

      {selected && (
        <NeonCard>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium break-words">
                {selected.name} <span className={`ml-1 rounded px-1.5 text-[11px] align-middle ${STATUS_STYLE[selected.status]}`}>{TOURNAMENT_STATUS[selected.status]}</span>
              </p>
              <p className="text-xs text-slate-500">
                {selected.game} · {TOURNAMENT_BEST_OF[selected.bestOf]} · up to {selected.maxTeams} teams
                {selected.startAt ? ` · starts ${new Date(selected.startAt).toLocaleString()}` : " · you start it"}
              </p>
              <p className="mt-2 text-sm text-slate-300">{NEXT_STEP[selected.status]}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {selected.status === "DRAFT" && (
                <button type="button" disabled={busy} className="neon-button-sm" onClick={() => act(selected, "open", "Registration is open. The post is up in Discord.")}>
                  Open registration
                </button>
              )}
              {selected.status === "OPEN" && selected.checkIn && (
                <button type="button" disabled={busy} className="neon-button-sm" onClick={() => act(selected, "checkin", "Check-in is open.")}>
                  Open check-in now
                </button>
              )}
              {(selected.status === "OPEN" || selected.status === "CHECKIN") && (
                <button
                  type="button"
                  disabled={busy}
                  className="neon-button-sm"
                  onClick={() => act(selected, "start", "The bracket is live.", selected.status === "CHECKIN" ? "Start now? Teams that haven't checked in are taken out." : "Start now? Registration closes and the bracket is made.")}
                >
                  Start now
                </button>
              )}
              {(selected.status === "DRAFT" || selected.status === "OPEN") && (
                <button type="button" className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:border-white/25" onClick={() => setForm(toInput(selected))}>
                  Edit
                </button>
              )}
              {["OPEN", "CHECKIN", "LIVE"].includes(selected.status) && (
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10"
                  onClick={() => act(selected, "cancel", "Canceled.", `Cancel ${selected.name}? Live matches are closed and nothing more is recorded.`)}
                >
                  Cancel tournament
                </button>
              )}
              {(selected.status === "DONE" || selected.status === "CANCELED") && (
                <button type="button" disabled={busy} className="neon-button-sm" onClick={() => act(selected, "duplicate", "A copy was made as a draft (next week, if it had a start time).")}>
                  🔁 Run it again
                </button>
              )}
              {(selected.status === "DRAFT" || selected.status === "DONE" || selected.status === "CANCELED") && (
                <button
                  type="button"
                  disabled={busy}
                  className="px-2 text-xs text-slate-500 hover:text-rose-400"
                  onClick={async () => {
                    if (!(await confirm(`Delete ${selected.name}? ${selected.status === "DONE" ? "It leaves the Hall of Fame and its post is removed." : ""}`))) return;
                    await run(() => api.deleteTournament(guildId, selected.id), "Deleted.");
                    setSelectedId(null);
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          </div>

          {selected.status === "DONE" && selected.championEntryId && (
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              👑 <b>{selected.entries.find((e) => e.id === selected.championEntryId)?.name}</b> won.{" "}
              <span className="text-slate-400">{selected.entries.find((e) => e.id === selected.championEntryId)?.players.map(name).join(", ")}</span>
            </div>
          )}

          {selected.bracket.length > 0 ? (
            <div className="mt-5">
              <Bracket
                guildId={guildId}
                t={selected}
                view={view}
                onWinner={async (r, i, side) => {
                  const tie = selected.bracket[r][i];
                  const winner = selected.entries.find((e) => e.id === (side === "a" ? tie.a : tie.b))?.name;
                  if (!(await confirm(`Set ${winner} as the winner of this match? Its thread closes and they move on.`))) return;
                  await run(() => api.setTournamentTieWinner(guildId, selected.id, r, i, side), `${winner} moves on.`);
                }}
              />
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium">
                  Teams {selected.entries.filter((e) => !e.out).length}/{selected.maxTeams}
                </p>
                {selected.entries.filter((e) => !e.out).length === 0 && <p className="text-sm text-slate-500">No teams yet.</p>}
                <div className="divide-y divide-white/5">
                  {selected.entries
                    .filter((e) => !e.out)
                    .map((e) => (
                      <div key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="break-words">
                            {selected.status === "CHECKIN" ? (e.checkedIn ? "✅ " : "⏳ ") : ""}
                            {e.name}
                          </p>
                          <p className="text-xs text-slate-500 break-words">👑 {name(e.captainId)} · {e.players.filter((p) => p !== e.captainId).map(name).join(", ")}</p>
                        </div>
                        {(selected.status === "OPEN" || selected.status === "CHECKIN") && (
                          <button
                            type="button"
                            className="shrink-0 text-xs text-slate-500 hover:text-rose-400"
                            onClick={async () => {
                              if (!(await confirm(`Remove ${e.name} from ${selected.name}?`))) return;
                              await run(() => api.removeTournamentEntry(guildId, selected.id, e.id), `${e.name} removed.`);
                            }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              </div>
              {selected.soloSignups && (
                <div>
                  <p className="mb-2 text-sm font-medium">Solo players {selected.solo.length}</p>
                  <p className="text-sm text-slate-400 break-words">
                    {selected.solo.length ? selected.solo.map((id) => `${selected.status === "CHECKIN" ? (selected.soloReady.includes(id) ? "✅ " : "⏳ ") : ""}${name(id)}`).join(", ") : "Nobody yet."}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Put into teams when it starts.</p>
                </div>
              )}
            </div>
          )}
        </NeonCard>
      )}

      {champions.length > 0 && (
        <NeonCard>
          <p className="font-medium mb-2">👑 Hall of Fame</p>
          <div className="divide-y divide-white/5">
            {champions.map((t) => {
              const champ = t.entries.find((e) => e.id === t.championEntryId);
              return (
                <button key={t.id} type="button" onClick={() => setSelectedId(t.id)} className="flex w-full flex-wrap items-baseline justify-between gap-2 py-2 text-left text-sm hover:text-neon-blue">
                  <span>
                    <b>{champ?.name}</b> <span className="text-slate-500">· {t.name}</span>
                  </span>
                  <span className="text-xs text-slate-500">
                    {champ?.players.map(name).join(", ")} · {t.endedAt ? new Date(t.endedAt).toLocaleDateString() : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </NeonCard>
      )}

      {past.length > champions.length && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-500">Canceled ({past.length - champions.length})</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {past
              .filter((t) => !champions.includes(t))
              .map((t) => (
                <button key={t.id} type="button" onClick={() => setSelectedId(t.id)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:border-white/25">
                  {t.name}
                </button>
              ))}
          </div>
        </details>
      )}
    </div>
  );
}
