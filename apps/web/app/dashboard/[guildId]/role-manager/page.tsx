"use client";

import { useEffect, useMemo, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import {
  api,
  type BulkRoleFilter,
  type BulkRoleJobRow,
  type RoleChangeRow,
  type RoleManagerInfo,
  type RoleManagerMember,
  type RoleManagerRole,
  type TimedRoleRow,
} from "../../../../lib/api";

type Tab = "members" | "bulk" | "timed" | "history" | "settings";
const TABS: Array<[Tab, string]> = [
  ["members", "👤 Members"],
  ["bulk", "👥 Bulk"],
  ["timed", "⏳ Timed Roles"],
  ["history", "📜 History"],
  ["settings", "⚙️ Settings"],
];

const label = "text-xs uppercase tracking-wide text-slate-500 block mb-2";
const field = "w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm";
const hint = "text-xs text-slate-500";
const DURATIONS: Array<[number | null, string]> = [
  [null, "Keep it"],
  [60, "1 hour"],
  [360, "6 hours"],
  [1440, "1 day"],
  [4320, "3 days"],
  [10080, "1 week"],
  [43200, "30 days"],
];

const until = (iso: string) => {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "ending now";
  const m = Math.round(ms / 60000);
  if (m < 60) return `ends in ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `ends in ${h} h`;
  return `ends in ${Math.round(h / 24)} days`;
};

function RoleChip({ role, onRemove, note }: { role: RoleManagerRole | undefined; onRemove?: () => void; note?: string }) {
  if (!role) return null;
  return (
    <span
      title={role.blocked ?? undefined}
      className={`inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs mr-1.5 mb-1.5 ${role.blocked ? "opacity-50" : ""}`}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: role.color ?? "#99aab5" }} />
      {role.name}
      {note && <span className="text-slate-500">· {note}</span>}
      {onRemove && !role.blocked && (
        <button type="button" onClick={onRemove} className="text-slate-500 hover:text-rose-400" aria-label={`Take ${role.name}`}>
          ✕
        </button>
      )}
    </span>
  );
}

function RolePicker({ roles, value, onChange, placeholder = "Pick a role…", allowBlocked = false }: { roles: RoleManagerRole[]; value: string; onChange: (id: string) => void; placeholder?: string; allowBlocked?: boolean }) {
  return (
    <select className={field} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {roles.map((r) => (
        <option key={r.id} value={r.id} disabled={!allowBlocked && !!r.blocked}>
          {r.name}
          {!allowBlocked && r.blocked ? " (can't change)" : ""}
        </option>
      ))}
    </select>
  );
}

export default function RoleManagerPage({ params }: { params: { guildId: string } }) {
  const guildId = params.guildId;
  const [info, setInfo] = useState<RoleManagerInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("members");

  function load() {
    api.getRoleManager(guildId).then(setInfo).catch((e) => setError(e instanceof Error ? e.message : "Couldn't load roles."));
  }
  useEffect(load, [guildId]);

  const roleMap = useMemo(() => new Map((info?.roles ?? []).map((r) => [r.id, r])), [info]);
  const blockedTooHigh = info?.roles.some((r) => r.blocked?.includes("above Spartacus's role"));

  return (
    <div>
      <ModuleHeader
        guildId={guildId}
        moduleKey="ROLE_MANAGER"
        title="Role Manager"
        description="Give and take members' roles, change many at once, give roles for a set time, and see every change. Staff can also use /role in Discord."
      />

      <div className="flex flex-wrap gap-2 mb-5">
        {TABS.map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`text-sm font-medium px-4 py-2 rounded-lg border transition-colors ${
              tab === k ? "bg-neon-blue/15 border-neon-blue/40 text-white" : "border-white/10 text-slate-400 hover:text-white"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-rose-400 mb-4">{error}</p>}
      {blockedTooHigh && (
        <div className="mb-4 max-w-3xl rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          Some roles are above Spartacus's role, so they're greyed out. Drag Spartacus higher in Server Settings → Roles to manage them.
        </div>
      )}

      {!info && !error && <p className="text-slate-400">Loading…</p>}
      {info && tab === "members" && <MembersTab guildId={guildId} info={info} roleMap={roleMap} />}
      {info && tab === "bulk" && <BulkTab guildId={guildId} info={info} roleMap={roleMap} />}
      {info && tab === "timed" && <TimedTab guildId={guildId} roleMap={roleMap} />}
      {info && tab === "history" && <HistoryTab guildId={guildId} />}
      {info && tab === "settings" && <SettingsTab guildId={guildId} info={info} onSaved={load} />}
    </div>
  );
}

function MembersTab({ guildId, info, roleMap }: { guildId: string; info: RoleManagerInfo; roleMap: Map<string, RoleManagerRole> }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<RoleManagerMember[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<RoleManagerMember | null>(null);
  const [addRole, setAddRole] = useState("");
  const [minutes, setMinutes] = useState<number | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      api
        .searchRoleMembers(guildId, term)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q, guildId]);

  async function open(m: RoleManagerMember) {
    setNote(null);
    setSelected(await api.getRoleMember(guildId, m.id).catch(() => m));
  }

  async function change(roleId: string, action: "GIVE" | "TAKE") {
    if (!selected) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await api.changeMemberRole(guildId, selected.id, roleId, action, action === "GIVE" ? minutes : null);
      setNote({ ok: true, text: r.message.replace(/<t:(\d+):R>/, (_m, s) => new Date(Number(s) * 1000).toLocaleString()) });
      setSelected(await api.getRoleMember(guildId, selected.id));
      setAddRole("");
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : "That didn't work." });
    } finally {
      setBusy(false);
    }
  }

  const timed = new Map((selected?.timed ?? []).map((t) => [t.roleId, t.expiresAt]));
  const sortedRoles = selected ? info.roles.filter((r) => selected.roleIds.includes(r.id)) : [];
  const addable = selected ? info.roles.filter((r) => !selected.roleIds.includes(r.id)) : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_1fr] gap-4 items-start max-w-5xl">
      <NeonCard>
        <label className={label}>Search Members</label>
        <input className={field} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or user ID" autoFocus />
        <div className="mt-3 flex flex-col gap-1">
          {searching && <p className={hint}>Searching…</p>}
          {!searching && q.trim().length >= 2 && results.length === 0 && <p className={hint}>Nobody found.</p>}
          {results.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => open(m)}
              className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${selected?.id === m.id ? "bg-neon-blue/15" : "hover:bg-white/5"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.avatar} alt="" className="h-7 w-7 rounded-full" />
              <span className="min-w-0">
                <span className="block truncate">
                  {m.displayName} {m.bot && <span className="text-[10px] bg-[#5865f2] px-1 rounded">APP</span>}
                </span>
                <span className="block text-xs text-slate-500 truncate">
                  @{m.username} · {m.roleIds.length} role{m.roleIds.length === 1 ? "" : "s"}
                </span>
              </span>
            </button>
          ))}
        </div>
      </NeonCard>

      <NeonCard>
        {!selected ? (
          <p className="text-sm text-slate-500">Search for someone and pick them to see and change their roles.</p>
        ) : (
          <div>
            <div className="flex items-center gap-3 mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selected.avatar} alt="" className="h-10 w-10 rounded-full" />
              <div>
                <p className="font-medium">{selected.displayName}</p>
                <p className={hint}>
                  @{selected.username}
                  {selected.joinedAt ? ` · joined ${new Date(selected.joinedAt).toLocaleDateString()}` : ""}
                </p>
              </div>
            </div>
            <p className={label}>Roles · tap ✕ to take one</p>
            <div className="mb-4">
              {sortedRoles.length === 0 && <p className={hint}>No roles.</p>}
              {sortedRoles.map((r) => (
                <RoleChip key={r.id} role={roleMap.get(r.id)} note={timed.get(r.id) ? until(timed.get(r.id)!) : undefined} onRemove={() => change(r.id, "TAKE")} />
              ))}
            </div>
            <p className={label}>Give a Role</p>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px_auto] gap-2">
              <RolePicker roles={addable} value={addRole} onChange={setAddRole} />
              <select className={field} value={minutes ?? ""} onChange={(e) => setMinutes(e.target.value ? Number(e.target.value) : null)}>
                {DURATIONS.map(([m, l]) => (
                  <option key={l} value={m ?? ""}>
                    {l}
                  </option>
                ))}
              </select>
              <button onClick={() => addRole && change(addRole, "GIVE")} disabled={!addRole || busy} className="neon-button-sm disabled:opacity-50">
                {busy ? "…" : "Give"}
              </button>
            </div>
            <p className={`${hint} mt-2`}>Pick a time to make it a timed role. Spartacus takes it off when the time's up.</p>
            {note && <p className={`text-xs mt-3 ${note.ok ? "text-emerald-400" : "text-rose-400"}`}>{note.text}</p>}
            <p className={`${hint} mt-4`}>Greyed-out roles can't be changed here. Hover one to see why.</p>
          </div>
        )}
      </NeonCard>
    </div>
  );
}

function BulkTab({ guildId, info, roleMap }: { guildId: string; info: RoleManagerInfo; roleMap: Map<string, RoleManagerRole> }) {
  const confirm = useConfirm();
  const [action, setAction] = useState<"GIVE" | "TAKE">("GIVE");
  const [roleId, setRoleId] = useState("");
  const [filter, setFilter] = useState<BulkRoleFilter>({ who: "everyone", filterRoleId: null, joinedWithinDays: null, includeBots: false });
  const [preview, setPreview] = useState<{ count: number; sample: string[]; blocked: string | null } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [showList, setShowList] = useState(false);
  const [jobs, setJobs] = useState<BulkRoleJobRow[]>([]);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const loadJobs = () => api.getBulkRoleJobs(guildId).then(setJobs).catch(() => null);
  useEffect(() => {
    loadJobs();
  }, [guildId]);
  // Watch progress while something is running.
  useEffect(() => {
    if (!jobs.some((j) => j.status === "RUNNING" || j.status === "UNDOING")) return;
    const t = setInterval(loadJobs, 2500);
    return () => clearInterval(t);
  }, [jobs]);

  // The count updates as the choices change.
  useEffect(() => {
    setPreview(null);
    if (!roleId || (filter.who !== "everyone" && !filter.filterRoleId)) return;
    setPreviewing(true);
    const t = setTimeout(() => {
      api
        .previewBulkRole(guildId, roleId, action, filter)
        .then(setPreview)
        .catch((e) => setNote({ ok: false, text: e instanceof Error ? e.message : "Couldn't count members." }))
        .finally(() => setPreviewing(false));
    }, 400);
    return () => clearTimeout(t);
  }, [guildId, roleId, action, filter]);

  async function run() {
    if (!preview?.count) return;
    const role = roleMap.get(roleId)?.name ?? "this role";
    const ok = await confirm(`${action === "GIVE" ? "Give" : "Take"} ${role} ${action === "GIVE" ? "to" : "from"} ${preview.count} member${preview.count === 1 ? "" : "s"}? You can undo it for 24 hours.`, {
      title: "Run bulk change",
      confirmLabel: `${action === "GIVE" ? "Give" : "Take"} for ${preview.count}`,
    });
    if (!ok) return;
    setNote(null);
    try {
      await api.startBulkRole(guildId, roleId, action, filter);
      setNote({ ok: true, text: "Started. Progress shows below." });
      setPreview(null);
      loadJobs();
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : "That didn't work." });
    }
  }

  async function undo(job: BulkRoleJobRow) {
    const ok = await confirm(`Undo this? It ${job.action === "GIVE" ? "takes" : "gives"} ${roleMap.get(job.roleId)?.name ?? "the role"} ${job.action === "GIVE" ? "from" : "back to"} the ${job.changedCount} member${job.changedCount === 1 ? "" : "s"} it changed.`, {
      title: "Undo bulk change",
      confirmLabel: "Undo",
    });
    if (!ok) return;
    try {
      const r = await api.undoBulkRole(guildId, job.id);
      setNote({ ok: true, text: r.message });
      loadJobs();
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : "That didn't work." });
    }
  }

  const canUndo = (j: BulkRoleJobRow) => j.status === "DONE" && j.changedCount > 0 && Date.now() - new Date(j.finishedAt ?? j.createdAt).getTime() < 86_400_000;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start max-w-5xl">
      <NeonCard>
        <div className="flex gap-2 mb-4">
          {(["GIVE", "TAKE"] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAction(a)}
              className={`flex-1 text-sm font-medium px-3 py-2 rounded-lg border ${action === a ? "bg-neon-blue/15 border-neon-blue/40 text-white" : "border-white/10 text-slate-400"}`}
            >
              {a === "GIVE" ? "➕ Give a role" : "➖ Take a role"}
            </button>
          ))}
        </div>
        <label className={label}>Role</label>
        <RolePicker roles={info.roles} value={roleId} onChange={setRoleId} />

        <label className={`${label} mt-4`}>{action === "GIVE" ? "To" : "From"}</label>
        <select className={field} value={filter.who} onChange={(e) => setFilter({ ...filter, who: e.target.value as BulkRoleFilter["who"] })}>
          <option value="everyone">Everyone</option>
          <option value="has">Members who have a role…</option>
          <option value="missing">Members who don't have a role…</option>
        </select>
        {filter.who !== "everyone" && (
          <div className="mt-2">
            <RolePicker roles={info.roles} value={filter.filterRoleId ?? ""} onChange={(id) => setFilter({ ...filter, filterRoleId: id || null })} allowBlocked placeholder="Which role?" />
          </div>
        )}
        <label className={`${label} mt-4`}>Joined</label>
        <select className={field} value={filter.joinedWithinDays ?? ""} onChange={(e) => setFilter({ ...filter, joinedWithinDays: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Any time</option>
          <option value="1">In the last day</option>
          <option value="7">In the last week</option>
          <option value="30">In the last 30 days</option>
          <option value="90">In the last 90 days</option>
        </select>
        <label className="flex items-center gap-2 text-sm mt-4">
          <input type="checkbox" checked={!!filter.includeBots} onChange={(e) => setFilter({ ...filter, includeBots: e.target.checked })} />
          Include bots
        </label>

        <div className="mt-5 pt-4 border-t border-white/5">
          {!roleId ? (
            <p className={hint}>Pick a role to see who it would change.</p>
          ) : previewing ? (
            <p className={hint}>Counting…</p>
          ) : preview ? (
            <div>
              {preview.blocked && <p className="text-xs text-rose-400 mb-2">{preview.blocked}</p>}
              <p className="text-sm">
                This changes <b>{preview.count}</b> member{preview.count === 1 ? "" : "s"}.{" "}
                {preview.count > 0 && (
                  <button type="button" onClick={() => setShowList((v) => !v)} className="text-neon-blue text-xs hover:underline">
                    {showList ? "Hide who" : "See who"}
                  </button>
                )}
              </p>
              {showList && (
                <p className="text-xs text-slate-400 mt-2">
                  {preview.sample.join(", ")}
                  {preview.count > preview.sample.length ? ` and ${preview.count - preview.sample.length} more` : ""}
                </p>
              )}
              <button onClick={run} disabled={!preview.count || !!preview.blocked} className="neon-button-sm mt-3 disabled:opacity-50">
                Run
              </button>
            </div>
          ) : null}
          {note && <p className={`text-xs mt-3 ${note.ok ? "text-emerald-400" : "text-rose-400"}`}>{note.text}</p>}
        </div>
      </NeonCard>

      <NeonCard>
        <p className="font-medium mb-1">Recent Bulk Changes</p>
        <p className={`${hint} mb-3`}>Undo is available for 24 hours after one finishes.</p>
        {jobs.length === 0 && <p className={hint}>None yet.</p>}
        <div className="flex flex-col gap-3">
          {jobs.map((j) => {
            const pct = j.total ? Math.round(((j.done + j.failed) / j.total) * 100) : 0;
            return (
              <div key={j.id} className="rounded-lg border border-white/10 p-3">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {j.action === "GIVE" ? "Gave" : "Took"} <b>{roleMap.get(j.roleId)?.name ?? "a deleted role"}</b> · {j.total} member{j.total === 1 ? "" : "s"}
                  </span>
                  {canUndo(j) && (
                    <button onClick={() => undo(j)} className="text-xs text-neon-blue hover:underline">
                      ↩ Undo
                    </button>
                  )}
                </div>
                {j.status === "RUNNING" && (
                  <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full bg-neon-blue transition-all" style={{ width: `${pct}%` }} />
                  </div>
                )}
                <p className={`${hint} mt-1`}>
                  {j.status === "RUNNING" ? `Running · ${j.done + j.failed} of ${j.total}` : j.status === "UNDOING" ? "Undoing…" : j.status === "UNDONE" ? "Undone" : j.status === "STOPPED" ? "Stopped by a bot restart" : `Done · ${j.done} changed${j.failed ? `, ${j.failed} failed` : ""}`}
                  {" · "}
                  {j.byName} · {new Date(j.createdAt).toLocaleString()}
                </p>
              </div>
            );
          })}
        </div>
      </NeonCard>
    </div>
  );
}

function TimedTab({ guildId, roleMap }: { guildId: string; roleMap: Map<string, RoleManagerRole> }) {
  const [rows, setRows] = useState<TimedRoleRow[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const load = () => api.getTimedRoles(guildId).then(setRows).catch(() => setRows([]));
  useEffect(() => {
    load();
  }, [guildId]);

  async function end(r: TimedRoleRow) {
    try {
      const res = await api.endTimedRole(guildId, r.id);
      setNote(res.message);
      load();
    } catch (err) {
      setNote(err instanceof Error ? err.message : "That didn't work.");
    }
  }

  return (
    <NeonCard className="max-w-3xl">
      <p className="font-medium mb-1">Timed Roles</p>
      <p className={`${hint} mb-4`}>Roles given for a set time. Spartacus takes each one off when its time is up, even after a restart. Give one from the Members tab, or with /role give … for:2d.</p>
      {rows === null && <p className={hint}>Loading…</p>}
      {rows?.length === 0 && <p className={hint}>No timed roles right now.</p>}
      <div className="flex flex-col divide-y divide-white/5">
        {rows?.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span>
              <RoleChip role={roleMap.get(r.roleId)} /> → <b>{r.displayName}</b>
            </span>
            <span className="flex items-center gap-3 whitespace-nowrap">
              <span className={hint} title={new Date(r.expiresAt).toLocaleString()}>
                {until(r.expiresAt)}
              </span>
              <button onClick={() => end(r)} className="text-xs text-slate-400 hover:text-rose-400">
                End now
              </button>
            </span>
          </div>
        ))}
      </div>
      {note && <p className="text-xs text-slate-400 mt-3">{note}</p>}
    </NeonCard>
  );
}

const ACTION: Record<RoleChangeRow["action"], { icon: string; text: string; tone: string }> = {
  GIVE: { icon: "➕", text: "Gave", tone: "text-emerald-400" },
  TAKE: { icon: "➖", text: "Took", tone: "text-amber-300" },
  EXPIRED: { icon: "⏳", text: "Ended", tone: "text-slate-400" },
};
const SOURCE: Record<RoleChangeRow["source"], string> = { DASHBOARD: "Dashboard", DISCORD: "/role", BULK: "Bulk", TIMER: "Timer", UNDO: "Undo" };

function HistoryTab({ guildId }: { guildId: string }) {
  const [rows, setRows] = useState<RoleChangeRow[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    api.getRoleHistory(guildId).then(setRows).catch(() => setRows([]));
  }, [guildId]);
  const shown = (rows ?? []).filter((r) => !q || `${r.username} ${r.roleName} ${r.byName ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <NeonCard className="max-w-3xl">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="font-medium">History</p>
        <input className={`${field} max-w-56`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name or role" />
      </div>
      <p className={`${hint} mb-4`}>Every role change made through Spartacus, newest first (last 200).</p>
      {rows === null && <p className={hint}>Loading…</p>}
      {rows && shown.length === 0 && <p className={hint}>Nothing yet.</p>}
      <div className="flex flex-col divide-y divide-white/5">
        {shown.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="min-w-0">
              <span className={ACTION[r.action].tone}>
                {ACTION[r.action].icon} {ACTION[r.action].text}
              </span>{" "}
              <b>{r.roleName}</b> {r.action === "GIVE" ? "to" : "from"} <b>{r.username}</b>
              <span className="block text-xs text-slate-500">
                {SOURCE[r.source]}
                {r.byName ? ` · by ${r.byName}` : ""}
                {r.detail ? ` · ${r.detail}` : ""}
              </span>
            </span>
            <span className="text-xs text-slate-500 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </NeonCard>
  );
}

function MultiRole({ roles, value, onChange }: { roles: RoleManagerRole[]; value: string[]; onChange: (ids: string[]) => void }) {
  return (
    <div>
      <div className="mb-2">
        {value.map((id) => (
          <RoleChip key={id} role={roles.find((r) => r.id === id) ?? { id, name: "Deleted role", color: null, managed: false, powerful: false, blocked: null }} onRemove={() => onChange(value.filter((v) => v !== id))} />
        ))}
      </div>
      <RolePicker roles={roles.filter((r) => !value.includes(r.id))} value="" onChange={(id) => id && onChange([...value, id])} allowBlocked placeholder="＋ Add a role…" />
    </div>
  );
}

function SettingsTab({ guildId, info, onSaved }: { guildId: string; info: RoleManagerInfo; onSaved: () => void }) {
  const [cfg, setCfg] = useState(info.config);
  const [saved, setSaved] = useState(false);
  async function save(next: RoleManagerInfo["config"]) {
    setCfg(next);
    await api.setRoleManager(guildId, next).catch(() => null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSaved();
  }
  return (
    <NeonCard className="max-w-xl">
      <label className={label}>Staff Roles for /role</label>
      <MultiRole roles={info.roles} value={cfg.staffRoleIds} onChange={(ids) => save({ ...cfg, staffRoleIds: ids })} />
      <p className={`${hint} mt-1 mb-5`}>
        Anyone with Manage Roles can use /role. These roles can too. In Discord, also allow them under Server Settings → Integrations → Spartacus → /role.
      </p>

      <label className={label}>Log Channel (optional)</label>
      <ChannelSelect guildId={guildId} value={cfg.logChannelId} onChange={(id) => save({ ...cfg, logChannelId: id || null })} kind="text" placeholder="None" />
      <p className={`${hint} mt-1 mb-5`}>Posts a line for every give, take, bulk change and ended timed role.</p>

      <label className={label}>Hidden Roles</label>
      <MultiRole roles={info.roles} value={cfg.hiddenRoleIds} onChange={(ids) => save({ ...cfg, hiddenRoleIds: ids })} />
      <p className={`${hint} mt-1`}>These can never be given or taken here or with /role.</p>

      <div className="mt-5 pt-4 border-t border-white/5 text-xs text-slate-400 space-y-1">
        <p className="font-medium text-slate-300">Always on</p>
        <p>• Nobody can give or take a role at or above their own top role.</p>
        <p>• Roles with Administrator, Manage Server, Manage Roles, Ban, Kick and other powerful permissions are server-owner only.</p>
        <p>• Bot and Booster roles can't be changed.</p>
      </div>
      {saved && <p className="text-xs text-emerald-400 mt-3">Saved ✓</p>}
    </NeonCard>
  );
}
