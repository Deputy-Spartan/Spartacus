"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  COMMON_TIMEZONES,
  DAY_NAMES,
  REPEAT_LABELS,
  REPEAT_NEEDS_DATE,
  SCHEDULE_DAY_ORDER,
  SCHEDULE_PLATFORMS,
  SCHEDULE_PLATFORM_NAMES,
  SCHEDULE_POST_DEFAULTS,
  SCHEDULE_REPEATS,
  describeRepeat,
  formatTimeOfDay,
  nextOccurrence,
  platformInfo,
  scheduleWeekLabel,
  type ScheduleRepeat,
  type SchedulePlatform,
} from "@spartacus/shared";
import { NeonCard } from "../ui/NeonCard";
import { ChannelSelect } from "../ui/ChannelSelect";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { useConfirm } from "../ui/ConfirmDialog";
import { ModuleMessage, designFrom } from "../embedCreator/ModuleMessage";
import { api, type RoleManagerMember, type StreamExtrasConfigRow, type StreamSlotRow, type StreamSubscription } from "../../lib/api";

const label = "text-xs uppercase tracking-wide text-slate-500 block mb-2";
const field = "w-full min-w-0 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm";
const hint = "text-xs text-slate-500";
const button = "text-sm px-3 py-2 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:border-white/30 transition-colors disabled:opacity-50";

const PLATFORM_COLORS: Record<SchedulePlatform, string> = { twitch: "#9146FF", kick: "#53FC18", tiktok: "#FF2A6D", youtube: "#FF3B30" };
const CATEGORY_IDEAS: Record<SchedulePlatform, string[]> = {
  twitch: ["Just Chatting", "Rainbow Six Siege", "Grand Theft Auto V", "Call of Duty: Warzone", "Fortnite"],
  kick: ["Just Chatting", "Grand Theft Auto V", "Rainbow Six Siege", "IRL"],
  tiktok: ["Gaming", "Just Chatting", "Music"],
  youtube: ["Gaming", "Grand Theft Auto V", "Rainbow Six Siege"],
};

// A streamer from the Going Live list, with every platform they're saved on.
interface SavedStreamer {
  key: string;
  name: string;
  userId: string | null;
  links: Partial<Record<SchedulePlatform, string>>;
}
function savedStreamers(subs: StreamSubscription[]): SavedStreamer[] {
  const map = new Map<string, SavedStreamer>();
  for (const s of subs) {
    if (!SCHEDULE_PLATFORMS.includes(s.platform as SchedulePlatform)) continue;
    const key = s.discordUserId || (s.displayName || s.channelName).toLowerCase();
    const row = map.get(key) ?? { key, name: s.displayName || s.channelName.replace(/^@/, ""), userId: s.discordUserId ?? null, links: {} };
    row.links[s.platform as SchedulePlatform] ??= platformInfo(s.platform).url(s.channelName);
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

interface FormState {
  streamer: string;
  userId: string | null;
  repeat: ScheduleRepeat;
  day: number;
  date: string;
  time: string;
  hours: number;
  game: string;
  same: boolean;
  on: SchedulePlatform[];
  links: Partial<Record<SchedulePlatform, string>>;
  cats: Partial<Record<SchedulePlatform, string>>;
  streamTitle: string;
  message: string;
}
// Today on this device (not in UTC, which is already tomorrow late in the evening in the US).
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const EMPTY: FormState = { streamer: "", userId: null, repeat: "WEEKLY", day: 5, date: "", time: "19:00", hours: 2, game: "", same: true, on: [], links: {}, cats: {}, streamTitle: "", message: "" };

function fromSlot(s: StreamSlotRow): FormState {
  const ps = s.platforms ?? [];
  const cats = Object.fromEntries(ps.map((p) => [p.platform, p.category ?? ""]));
  const distinct = new Set(ps.map((p) => p.category ?? "").filter(Boolean));
  return {
    streamer: s.streamer,
    userId: s.userId ?? null,
    repeat: s.repeat ?? "WEEKLY",
    day: s.dayOfWeek,
    date: s.startDate ?? "",
    time: `${String(Math.floor(s.startMinutes / 60)).padStart(2, "0")}:${String(s.startMinutes % 60).padStart(2, "0")}`,
    hours: Math.round((s.durationMin / 60) * 2) / 2,
    game: s.title ?? [...distinct][0] ?? "",
    same: distinct.size <= 1,
    on: ps.map((p) => p.platform),
    links: Object.fromEntries(ps.map((p) => [p.platform, p.link ?? ""])),
    cats,
    streamTitle: s.streamTitle ?? "",
    message: s.message ?? "",
  };
}

export function ScheduleTab({
  guildId,
  config,
  update,
  slots,
  reload,
  setNote,
}: {
  guildId: string;
  config: StreamExtrasConfigRow;
  update: (p: Partial<StreamExtrasConfigRow>) => void;
  slots: StreamSlotRow[];
  reload: () => Promise<unknown>;
  setNote: (n: string | null) => void;
}) {
  const confirm = useConfirm();
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<StreamSlotRow | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  async function remove(s: StreamSlotRow) {
    if (!(await confirm(`Remove ${s.streamer} (${describeRepeat(s)})?`))) return;
    const r = await api.deleteStreamSlot(guildId, s.id).catch(() => null);
    setNote(r?.note ?? null);
    if (editing?.id === s.id) setEditing(null);
    await reload();
  }

  const tz = config.scheduleTimezone;
  const sorted = useMemo(
    () =>
      [...slots].sort((a, b) => {
        const na = nextOccurrence(tz, a)?.getTime() ?? Infinity;
        const nb = nextOccurrence(tz, b)?.getTime() ?? Infinity;
        return na - nb;
      }),
    [slots, tz]
  );

  return (
    <div className="space-y-4">
      <NeonCard className="max-w-3xl">
        <p className="font-medium mb-1">Where the schedule goes</p>
        <p className={`${hint} mb-3`}>One message that keeps itself up to date, pinned in the channel. It's edited in place, never reposted. Every time shows in each viewer's own time zone.</p>
        <label className={label}>Schedule channel</label>
        <ChannelSelect guildId={guildId} value={config.scheduleChannelId ?? null} onChange={(id) => update({ scheduleChannelId: id || null })} kind="text" />
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <div className="min-w-0">
            <label className={label}>Your time zone</label>
            <select className={field} value={config.scheduleTimezone} onChange={(e) => update({ scheduleTimezone: e.target.value })}>
              {[...new Set([config.scheduleTimezone, ...COMMON_TIMEZONES])].map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
            <p className={`${hint} mt-1`}>The times you pick below are in this zone.</p>
          </div>
          <div className="min-w-0">
            <label className={label}>Discord events</label>
            <div className="flex items-center gap-3 min-h-[42px]">
              <ToggleSwitch enabled={config.scheduleCreateEvents} onChange={(v) => update({ scheduleCreateEvents: v })} label="Make Discord events" />
              <span className={hint}>Members can tap Interested to get a reminder. The bot needs Manage Events.</span>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 mt-4 pt-4 border-t border-white/5">
          <div className="min-w-0">
            <p className="text-sm font-medium">Post a week ahead</p>
            <p className={hint}>
              {config.scheduleWeekAhead !== false
                ? `On: the post shows next week, Monday to Sunday (${scheduleWeekLabel(config.scheduleTimezone, true)} right now), and switches every Monday.`
                : `Off: the post shows this week, Monday to Sunday (${scheduleWeekLabel(config.scheduleTimezone, false)}).`}
            </p>
          </div>
          <ToggleSwitch enabled={config.scheduleWeekAhead !== false} onChange={(v) => update({ scheduleWeekAhead: v })} label="Post a week ahead" />
        </div>
        <button
          className={`${button} mt-4`}
          onClick={async () => {
            setMsg("Updating…");
            try {
              const r = await api.refreshStreamSchedule(guildId);
              setNote(r.note);
              setMsg("Updated.");
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Couldn't update it.");
            }
          }}
        >
          Update the message now
        </button>
        {msg && <span className={`${hint} ml-3`}>{msg}</span>}
      </NeonCard>

      <div ref={formRef} className="max-w-3xl scroll-mt-4">
        <StreamForm
          key={editing?.id ?? "new"}
          guildId={guildId}
          tz={tz}
          editing={editing}
          onCancel={() => setEditing(null)}
          onSaved={async (note) => {
            setNote(note);
            setEditing(null);
            await reload();
          }}
        />
      </div>

      <NeonCard className="max-w-3xl">
        <p className="font-medium mb-3">On the schedule</p>
        {sorted.length === 0 ? (
          <p className={hint}>Nothing scheduled yet.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {sorted.map((s) => {
              const next = nextOccurrence(tz, s);
              const ps = s.platforms ?? [];
              return (
                <li key={s.id} className="py-2.5 flex items-start justify-between gap-3">
                  <div className="text-sm min-w-0">
                    <p className="truncate">
                      <b>{s.streamer}</b>
                      {s.streamTitle ? ` — ${s.streamTitle}` : ""}
                    </p>
                    <p className={hint}>
                      {describeRepeat(s)} · {Math.round((s.durationMin / 60) * 10) / 10}h
                      {next ? ` · next ${next.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : " · finished"}
                    </p>
                    {(ps.length > 0 || s.title) && (
                      <p className={`${hint} truncate`}>
                        {[s.title, ...ps.map((p) => `${SCHEDULE_PLATFORM_NAMES[p.platform]}${p.category && p.category !== s.title ? ` (${p.category})` : ""}`)].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-3 shrink-0">
                    <button
                      className="text-xs text-slate-400 hover:text-neon-blue"
                      onClick={() => {
                        setEditing(s);
                        requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
                      }}
                    >
                      Edit
                    </button>
                    <button className="text-xs text-rose-300 hover:text-rose-200" onClick={() => remove(s)}>
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </NeonCard>

      <ModuleMessage
        guildId={guildId}
        title="Schedule post"
        description="The pinned schedule message. Monday to Sunday is added under its first embed, a section per day."
        ownerKey="streamExtras:schedulePost"
        savedEmbedId={config.scheduleEmbedId ?? null}
        onSavedEmbedChange={(id) => update({ scheduleEmbedId: id })}
        seed={() => designFrom({ title: SCHEDULE_POST_DEFAULTS.title, description: SCHEDULE_POST_DEFAULTS.description, footer: SCHEDULE_POST_DEFAULTS.footer, color: SCHEDULE_POST_DEFAULTS.color })}
        tokens={[
          { token: "{week}", description: "The week it shows, e.g. Mon, Nov 30 – Sun, Dec 6" },
          { token: "{count}", description: "How many streams that week, e.g. 14 streams" },
          { token: "{timezone}", description: "Your server's time zone" },
        ]}
        tokenValues={{ "{timezone}": tz, "{week}": scheduleWeekLabel(tz, config.scheduleWeekAhead !== false), "{count}": `${slots.length} stream${slots.length === 1 ? "" : "s"}` }}
      />
    </div>
  );
}

function StreamForm({ guildId, tz, editing, onCancel, onSaved }: { guildId: string; tz: string; editing: StreamSlotRow | null; onCancel: () => void; onSaved: (note: string | null) => void }) {
  const [f, setF] = useState<FormState>(() => (editing ? fromSlot(editing) : { ...EMPTY }));
  const set = (patch: Partial<FormState>) => setF((x) => ({ ...x, ...patch }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Streamer search: saved streamers (Going Live list) and server members.
  const [subs, setSubs] = useState<StreamSubscription[]>([]);
  const [members, setMembers] = useState<RoleManagerMember[]>([]);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(!!editing);
  useEffect(() => {
    api.getStreamSubscriptions(guildId).then(setSubs).catch(() => null);
  }, [guildId]);
  const saved = useMemo(() => savedStreamers(subs), [subs]);
  useEffect(() => {
    const q = f.streamer.trim();
    if (picked || q.length < 2) return setMembers([]);
    const t = setTimeout(() => api.searchRoleMembers(guildId, q).then((m) => setMembers(m.filter((x) => !x.bot).slice(0, 8))).catch(() => setMembers([])), 250);
    return () => clearTimeout(t);
  }, [f.streamer, guildId, picked]);
  const q = f.streamer.trim().toLowerCase();
  const savedMatches = saved.filter((s) => !q || s.name.toLowerCase().includes(q)).slice(0, 8);
  const memberMatches = members.filter((m) => !saved.some((s) => s.userId === m.id));

  function pickSaved(s: SavedStreamer) {
    const on = SCHEDULE_PLATFORMS.filter((p) => s.links[p]);
    set({ streamer: s.name, userId: s.userId, on, links: { ...s.links } });
    setPicked(true);
    setOpen(false);
  }
  function pickMember(m: RoleManagerMember) {
    const s = saved.find((x) => x.userId === m.id);
    if (s) return pickSaved({ ...s, name: m.displayName });
    set({ streamer: m.displayName, userId: m.id });
    setPicked(true);
    setOpen(false);
  }

  function toggle(p: SchedulePlatform) {
    const on = f.on.includes(p) ? f.on.filter((x) => x !== p) : SCHEDULE_PLATFORMS.filter((x) => x === p || f.on.includes(x));
    const known = saved.find((s) => s.userId && s.userId === f.userId)?.links[p];
    set({ on, links: !f.links[p] && known ? { ...f.links, [p]: known } : f.links });
  }

  const [h, m] = f.time.split(":").map(Number);
  const startMin = (h || 0) * 60 + (m || 0);
  const endMin = startMin + Math.round(f.hours * 60);
  const ends = `${formatTimeOfDay(endMin % 1440)}${endMin >= 1440 ? " the next day" : ""}`;
  const needsDate = REPEAT_NEEDS_DATE.has(f.repeat);
  const ideas = [...new Set(f.on.flatMap((p) => CATEGORY_IDEAS[p]))].slice(0, 6);
  const sameOn = f.same || f.on.length < 2;

  async function save() {
    if (!f.streamer.trim()) return setErr("Pick or type the streamer.");
    if (!f.on.length) return setErr("Turn on at least one platform.");
    if (needsDate && !f.date) return setErr(f.repeat === "ONCE" ? "Pick the date." : "Pick the date of the first stream.");
    setErr(null);
    setBusy(true);
    const body: Omit<StreamSlotRow, "id"> = {
      streamer: f.streamer.trim(),
      userId: f.userId,
      title: sameOn ? f.game.trim() || null : null,
      link: null,
      dayOfWeek: f.day,
      startMinutes: startMin,
      durationMin: Math.max(15, Math.round(f.hours * 60)),
      repeat: f.repeat,
      startDate: needsDate ? f.date : null,
      streamTitle: f.streamTitle.trim() || null,
      message: f.message.trim() || null,
      platforms: f.on.map((p) => ({ platform: p, link: f.links[p]?.trim() || null, category: (sameOn ? f.game : f.cats[p] ?? "").trim() || null })),
    };
    try {
      const r = editing ? await api.updateStreamSlot(guildId, editing.id, body) : await api.addStreamSlot(guildId, body);
      setF({ ...EMPTY });
      setPicked(false);
      onSaved(r.note);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save it.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <NeonCard>
      <div className="flex items-center justify-between mb-3">
        <p className="font-medium">{editing ? "Edit stream" : "Add a stream"}</p>
        {editing && (
          <button className="text-xs text-slate-500 hover:text-slate-300" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      <div className="space-y-4">
        {/* Streamer */}
        <div className="relative">
          <label className={label} htmlFor="sched-streamer">
            Streamer
          </label>
          <input
            id="sched-streamer"
            className={field}
            value={f.streamer}
            maxLength={60}
            autoComplete="off"
            placeholder="Start typing a name…"
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onChange={(e) => {
              set({ streamer: e.target.value, userId: null });
              setPicked(false);
              setOpen(true);
            }}
          />
          {open && (savedMatches.length > 0 || memberMatches.length > 0) && (
            <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-white/10 bg-base-900 shadow-xl max-h-72 overflow-auto p-1">
              {savedMatches.length > 0 && <p className="text-[11px] uppercase tracking-wide text-slate-500 px-2 pt-1.5 pb-1">Saved streamers</p>}
              {savedMatches.map((s) => (
                <button key={s.key} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pickSaved(s)} className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-white/5">
                  <span className="flex-1 min-w-0 truncate text-sm">{s.name}</span>
                  <span className="flex gap-1">
                    {SCHEDULE_PLATFORMS.filter((p) => s.links[p]).map((p) => (
                      <span key={p} className="w-2 h-2 rounded-full" style={{ background: PLATFORM_COLORS[p] }} title={SCHEDULE_PLATFORM_NAMES[p]} />
                    ))}
                  </span>
                </button>
              ))}
              {memberMatches.length > 0 && <p className="text-[11px] uppercase tracking-wide text-slate-500 px-2 pt-2 pb-1">Server members</p>}
              {memberMatches.map((m) => (
                <button key={m.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pickMember(m)} className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-white/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.avatar} alt="" className="w-6 h-6 rounded-full" />
                  <span className="flex-1 min-w-0 truncate text-sm">
                    {m.displayName} <span className="text-slate-500">@{m.username}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          <p className={`${hint} mt-1`}>{picked && f.userId ? "Linked to their Discord account." : "Saved streamers fill in their links. Type 2 letters to search the server."}</p>
        </div>

        {/* Platforms */}
        <div>
          <span className={label}>Streaming on</span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SCHEDULE_PLATFORMS.map((p) => {
              const on = f.on.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(p)}
                  className={`sp-metal px-3 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 ${on ? "is-active" : "opacity-70"}`}
                  style={on ? { boxShadow: `inset 0 0 0 1px ${PLATFORM_COLORS[p]}` } : undefined}
                >
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: PLATFORM_COLORS[p] }} />
                  {SCHEDULE_PLATFORM_NAMES[p]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Category */}
        {f.on.length >= 2 && (
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={f.same} onChange={(e) => set({ same: e.target.checked, cats: e.target.checked ? f.cats : Object.fromEntries(f.on.map((p) => [p, f.cats[p] || f.game])) })} />
            Same game or category on every platform
          </label>
        )}
        {sameOn && (
          <div>
            <label className={label} htmlFor="sched-game">
              Playing (category)
            </label>
            <input id="sched-game" className={field} value={f.game} maxLength={80} placeholder="e.g. Rainbow Six Siege" onChange={(e) => set({ game: e.target.value })} />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(ideas.length ? ideas : CATEGORY_IDEAS.twitch).map((c) => (
                <button key={c} type="button" onClick={() => set({ game: c })} className="text-xs px-2.5 py-1 rounded-full border border-white/10 text-slate-300 hover:border-neon-blue/50">
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}
        {f.on.map((p) => (
          <div key={p} className="rounded-lg border border-white/10 bg-base-950/60 p-3 space-y-3" style={{ borderLeft: `3px solid ${PLATFORM_COLORS[p]}` }}>
            <p className="text-sm font-semibold">{SCHEDULE_PLATFORM_NAMES[p]}</p>
            <div>
              <label className={label}>Link</label>
              <input className={field} value={f.links[p] ?? ""} maxLength={200} placeholder={platformInfo(p).url("name")} onChange={(e) => set({ links: { ...f.links, [p]: e.target.value } })} />
            </div>
            {!sameOn && (
              <div>
                <label className={label}>{SCHEDULE_PLATFORM_NAMES[p]} category</label>
                <input className={field} value={f.cats[p] ?? ""} maxLength={80} placeholder={`e.g. ${CATEGORY_IDEAS[p][1] ?? CATEGORY_IDEAS[p][0]}`} onChange={(e) => set({ cats: { ...f.cats, [p]: e.target.value } })} />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {CATEGORY_IDEAS[p].map((c) => (
                    <button key={c} type="button" onClick={() => set({ cats: { ...f.cats, [p]: c } })} className="text-xs px-2.5 py-1 rounded-full border border-white/10 text-slate-300 hover:border-neon-blue/50">
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Title and message */}
        <div>
          <label className={label} htmlFor="sched-title">
            Stream title (optional)
          </label>
          <input id="sched-title" className={field} value={f.streamTitle} maxLength={100} placeholder="e.g. Ranked grind to Champion 🏆" onChange={(e) => set({ streamTitle: e.target.value })} />
        </div>
        <div>
          <label className={label} htmlFor="sched-msg">
            Message (optional)
          </label>
          <textarea id="sched-msg" className={`${field} min-h-20`} value={f.message} maxLength={500} placeholder="Let people know what you're planning, e.g. Rob runs first, then customs with viewers." onChange={(e) => set({ message: e.target.value })} />
        </div>

        {/* When */}
        <div>
          <label className={label} htmlFor="sched-repeat">
            Repeats
          </label>
          <select id="sched-repeat" className={field} value={f.repeat} onChange={(e) => set({ repeat: e.target.value as ScheduleRepeat, date: f.date || today() })}>
            {SCHEDULE_REPEATS.map((r) => (
              <option key={r} value={r}>
                {REPEAT_LABELS[r]}
              </option>
            ))}
          </select>
          <p className={`${hint} mt-1`}>
            {f.repeat === "ONCE"
              ? "Shows on the schedule until it ends, then removes itself."
              : f.repeat === "MONTHLY"
              ? "Repeats on the same date each month (the last day when a month is shorter)."
              : f.repeat === "BIWEEKLY"
              ? "Repeats every other week, starting on the date you pick."
              : "Stays on the schedule until you remove it."}
          </p>
        </div>
        {f.repeat === "WEEKLY" && (
          <div>
            <label className={label} htmlFor="sched-day">
              Day
            </label>
            <select id="sched-day" className={field} value={f.day} onChange={(e) => set({ day: Number(e.target.value) })}>
              {SCHEDULE_DAY_ORDER.map((d) => (
                <option key={d} value={d}>
                  {DAY_NAMES[d]}
                </option>
              ))}
            </select>
          </div>
        )}
        {needsDate && (
          <div>
            <label className={label} htmlFor="sched-date">
              {f.repeat === "ONCE" ? "Date" : "First stream"}
            </label>
            <input id="sched-date" type="date" className={`${field} h-[42px]`} value={f.date} min={today()} onChange={(e) => set({ date: e.target.value })} />
            {f.date && (
              <p className={`${hint} mt-1`}>
                That&apos;s a <b className="text-slate-300">{DAY_NAMES[new Date(f.date + "T12:00:00Z").getUTCDay()]}</b>
                {f.repeat === "BIWEEKLY" ? ", so it repeats every other " + DAY_NAMES[new Date(f.date + "T12:00:00Z").getUTCDay()] : ""}.
              </p>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 items-start">
          <div className="min-w-0 overflow-hidden">
            <label className={label} htmlFor="sched-time">
              Starts
            </label>
            <input id="sched-time" type="time" className={`${field} h-[42px] py-0`} value={f.time} onChange={(e) => set({ time: e.target.value })} />
          </div>
          <div className="min-w-0">
            <label className={label} htmlFor="sched-hours">
              Hours
            </label>
            <div className="flex h-[42px] rounded-lg border border-white/10 bg-base-950 overflow-hidden">
              <button type="button" aria-label="Half an hour less" className="w-10 shrink-0 text-lg hover:bg-white/5" onClick={() => set({ hours: Math.max(0.5, f.hours - 0.5) })}>
                −
              </button>
              <input
                id="sched-hours"
                type="number"
                inputMode="decimal"
                min={0.5}
                max={24}
                step={0.5}
                className="flex-1 min-w-0 bg-transparent text-center text-sm"
                value={f.hours}
                onChange={(e) => set({ hours: Math.min(24, Math.max(0.5, Number(e.target.value) || 0.5)) })}
              />
              <button type="button" aria-label="Half an hour more" className="w-10 shrink-0 text-lg hover:bg-white/5" onClick={() => set({ hours: Math.min(24, f.hours + 0.5) })}>
                +
              </button>
            </div>
          </div>
        </div>
        <p className={hint}>
          Ends at <b className="text-slate-300">{ends}</b> ({f.hours} hour{f.hours === 1 ? "" : "s"}). Times are in {tz}.
        </p>

        {err && <p className="text-xs text-rose-400">{err}</p>}
        <div className="flex items-center gap-3">
          <button className="neon-button" disabled={busy} onClick={save}>
            {busy ? "Saving…" : editing ? "Save changes" : "Add to schedule"}
          </button>
        </div>
        <p className={hint}>
          Streamers can also add their own in Discord with <code>/schedule add</code>.
        </p>
      </div>
    </NeonCard>
  );
}
