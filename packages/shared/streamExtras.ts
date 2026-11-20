// Stream Extras: clips, the weekly stream schedule, and viewer rewards.
// The parts that don't touch Discord or the database live here, so the bot,
// the API and the dashboard all agree on them.

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
// Monday first, which is how a schedule is usually read.
export const SCHEDULE_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export const STREAM_EXTRAS_DEFAULTS = {
  clipsEnabled: false,
  clipsMinViews: 0,
  clipsWeekly: true,
  clipsWeeklyDay: 0,
  scheduleTimezone: "UTC",
  scheduleCreateEvents: false,
  scheduleWeekAhead: true,
  scheduleWeeksAhead: 1,
  rewardsEnabled: false,
  rewardCoins: 10,
  rewardXp: 10,
  rewardIntervalMin: 10,
  rewardDailyCoinCap: 200,
};

export const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// "7pm", "7:30 pm", "19:30" -> minutes after midnight, or null.
export function parseTimeOfDay(input: string): number | null {
  const m = input.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3] === "pm" ? 12 : 0);
  } else if (h > 23) return null;
  return h * 60 + min;
}

export function formatTimeOfDay(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// "mon", "Monday", "tues" -> 0..6 (0 = Sunday), or null.
export function parseDay(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  const i = DAY_NAMES.findIndex((d) => d.toLowerCase() === s || d.toLowerCase().startsWith(s.slice(0, 3)));
  return i >= 0 && s.length >= 3 ? i : null;
}

// How far a time zone is ahead of UTC at a moment, in milliseconds.
function zoneOffsetMs(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(at / 1000) * 1000;
}

// The next moment a weekly slot (day + time in the server's zone) starts,
// at or after `from`.
export function nextSlotStart(timeZone: string, dayOfWeek: number, startMinutes: number, from = new Date()): Date {
  const tz = isValidTimezone(timeZone) ? timeZone : "UTC";
  const zoned = new Date(from.getTime() + zoneOffsetMs(from.getTime(), tz));
  for (let add = 0; add <= 7; add++) {
    const day = new Date(Date.UTC(zoned.getUTCFullYear(), zoned.getUTCMonth(), zoned.getUTCDate() + add));
    if (day.getUTCDay() !== dayOfWeek) continue;
    const wall = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 0, startMinutes);
    // The offset can differ across a daylight-saving change, so settle it twice.
    let instant = wall - zoneOffsetMs(wall, tz);
    instant = wall - zoneOffsetMs(instant, tz);
    if (instant >= from.getTime()) return new Date(instant);
  }
  // Only reachable if today's slot just passed: a week from it.
  const day = new Date(Date.UTC(zoned.getUTCFullYear(), zoned.getUTCMonth(), zoned.getUTCDate() + 7));
  while (day.getUTCDay() !== dayOfWeek) day.setUTCDate(day.getUTCDate() + 1);
  const wall = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 0, startMinutes);
  return new Date(wall - zoneOffsetMs(wall, tz));
}

// ---- Repeats: how often a scheduled stream happens ----
export const SCHEDULE_REPEATS = ["ONCE", "DAILY", "WEEKDAYS", "WEEKENDS", "WEEKLY", "BIWEEKLY", "MONTHLY"] as const;
export type ScheduleRepeat = (typeof SCHEDULE_REPEATS)[number];
export const REPEAT_LABELS: Record<ScheduleRepeat, string> = {
  ONCE: "Just once",
  DAILY: "Every day",
  WEEKDAYS: "Weekdays (Mon–Fri)",
  WEEKENDS: "Weekends (Sat & Sun)",
  WEEKLY: "Every week",
  BIWEEKLY: "Every 2 weeks",
  MONTHLY: "Every month",
};
// Which repeats are picked by a date (the date itself, or the first stream) instead of a weekday.
export const REPEAT_NEEDS_DATE: ReadonlySet<string> = new Set(["ONCE", "BIWEEKLY", "MONTHLY"]);
export const REPEAT_NEEDS_DAY: ReadonlySet<string> = new Set(["WEEKLY"]);
export function cleanRepeat(v: unknown): ScheduleRepeat {
  return SCHEDULE_REPEATS.includes(v as ScheduleRepeat) ? (v as ScheduleRepeat) : "WEEKLY";
}
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export function cleanScheduleDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.match(DATE_RE);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? v : null;
}
// "YYYY-MM-DD" → day of the week (0 = Sunday).
export function dayOfDate(date: string): number {
  const m = date.match(DATE_RE)!;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
}

// The platforms a scheduled stream is on.
export const SCHEDULE_PLATFORMS = ["twitch", "kick", "tiktok", "youtube"] as const;
export type SchedulePlatform = (typeof SCHEDULE_PLATFORMS)[number];
export const SCHEDULE_PLATFORM_NAMES: Record<SchedulePlatform, string> = { twitch: "Twitch", kick: "Kick", tiktok: "TikTok", youtube: "YouTube" };
export interface SlotPlatform {
  platform: SchedulePlatform;
  link?: string | null;
  category?: string | null;
}
export function cleanSlotPlatforms(v: unknown): SlotPlatform[] {
  if (!Array.isArray(v)) return [];
  const out: SlotPlatform[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (!SCHEDULE_PLATFORMS.includes(r.platform as SchedulePlatform) || out.some((p) => p.platform === r.platform)) continue;
    const link = typeof r.link === "string" && /^https?:\/\//i.test(r.link.trim()) ? r.link.trim().slice(0, 200) : null;
    const category = typeof r.category === "string" && r.category.trim() ? r.category.trim().slice(0, 80) : null;
    out.push({ platform: r.platform as SchedulePlatform, link, category });
  }
  return out;
}

export interface RepeatSlot {
  repeat?: string | null;
  dayOfWeek: number;
  startMinutes: number;
  startDate?: string | null;
}

// The instant a wall-clock time on a date (in the zone) happens.
function wallInstant(tz: string, y: number, mo: number, d: number, minutes: number): number {
  const wall = Date.UTC(y, mo, d, 0, minutes);
  let instant = wall - zoneOffsetMs(wall, tz);
  instant = wall - zoneOffsetMs(instant, tz);
  return instant;
}

function onDay(slot: RepeatSlot, y: number, mo: number, d: number): boolean {
  const repeat = cleanRepeat(slot.repeat);
  const day = new Date(Date.UTC(y, mo, d));
  const dow = day.getUTCDay();
  const anchor = slot.startDate && cleanScheduleDate(slot.startDate) ? slot.startDate.match(DATE_RE)! : null;
  const anchorMs = anchor ? Date.UTC(+anchor[1], +anchor[2] - 1, +anchor[3]) : null;
  if (anchorMs !== null && day.getTime() < anchorMs) return false;
  switch (repeat) {
    case "ONCE":
      return anchorMs !== null && day.getTime() === anchorMs;
    case "DAILY":
      return true;
    case "WEEKDAYS":
      return dow >= 1 && dow <= 5;
    case "WEEKENDS":
      return dow === 0 || dow === 6;
    case "BIWEEKLY": {
      if (dow !== slot.dayOfWeek) return false;
      if (anchorMs === null) return true;
      return Math.round((day.getTime() - anchorMs) / 86_400_000 / 7) % 2 === 0;
    }
    case "MONTHLY": {
      if (!anchor) return false;
      const want = +anchor[3];
      const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
      return d === Math.min(want, last);
    }
    default:
      return dow === slot.dayOfWeek;
  }
}

// The next start of a scheduled stream at or after `from` (a stream that
// started up to `graceMs` ago still counts), or null when there isn't one
// (a one-time stream that's over).
export function nextOccurrence(timeZone: string, slot: RepeatSlot, from = new Date(), graceMs = 0): Date | null {
  const tz = isValidTimezone(timeZone) ? timeZone : "UTC";
  const zoned = new Date(from.getTime() + zoneOffsetMs(from.getTime(), tz));
  for (let add = -1; add <= 400; add++) {
    const y = zoned.getUTCFullYear(), mo = zoned.getUTCMonth(), d = zoned.getUTCDate() + add;
    const day = new Date(Date.UTC(y, mo, d));
    if (!onDay(slot, day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate())) continue;
    const at = wallInstant(tz, day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), slot.startMinutes);
    if (at >= from.getTime() - graceMs) return new Date(at);
  }
  return null;
}

// Every start in [from, until).
export function occurrencesBetween(timeZone: string, slot: RepeatSlot, from: Date, until: Date): Date[] {
  const out: Date[] = [];
  let cursor = from;
  for (let i = 0; i < 62; i++) {
    const next = nextOccurrence(timeZone, slot, cursor);
    if (!next || next.getTime() >= until.getTime()) break;
    out.push(next);
    cursor = new Date(next.getTime() + 60_000);
  }
  return out;
}

// "Fridays at 7:00 PM", "Every day at 9:00 PM", "Once, Nov 27 at 8:00 PM".
export function describeRepeat(slot: RepeatSlot): string {
  const time = formatTimeOfDay(slot.startMinutes);
  const repeat = cleanRepeat(slot.repeat);
  const date = slot.startDate && cleanScheduleDate(slot.startDate) ? new Date(slot.startDate + "T12:00:00Z") : null;
  const md = date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "";
  switch (repeat) {
    case "ONCE":
      return `Once, ${md} at ${time}`;
    case "DAILY":
      return `Every day at ${time}`;
    case "WEEKDAYS":
      return `Weekdays at ${time}`;
    case "WEEKENDS":
      return `Weekends at ${time}`;
    case "BIWEEKLY":
      return `Every other ${DAY_NAMES[slot.dayOfWeek]} at ${time}`;
    case "MONTHLY":
      return `Monthly on the ${date ? ordinal(date.getUTCDate()) : "same day"} at ${time}`;
    default:
      return `${DAY_NAMES[slot.dayOfWeek]}s at ${time}`;
  }
}
function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${s}`;
}

export interface BoardSlot extends RepeatSlot {
  id: string;
  streamer: string;
  title?: string | null; // what they're playing
  link?: string | null;
  streamTitle?: string | null;
  message?: string | null;
  platforms?: unknown;
  durationMin: number;
}

const REPEAT_TAG: Partial<Record<ScheduleRepeat, string>> = { BIWEEKLY: "every 2 weeks", MONTHLY: "monthly", ONCE: "📌 one time" };

// One stream, short and scannable:
//   🕙 **10:00 PM** · **Deputy_Spartan**
//   Robbing and Running
//   -# 🎮 Rob Run · Kick · TikTok · every 2 weeks
//   -# 💬 Gathering a lot of Goop
function boardLine(s: BoardSlot, at: Date, when: string, extraTag?: string): string {
  const ts = Math.floor(at.getTime() / 1000);
  const platforms = cleanSlotPlatforms(s.platforms);
  const tag = extraTag ?? REPEAT_TAG[cleanRepeat(s.repeat)];
  const lines = [`🕙 **${when || `<t:${ts}:t>`}** · **${s.streamer}**`];
  if (s.streamTitle) lines.push(s.streamTitle);
  const games = [...new Set([s.title, ...platforms.map((p) => p.category)].filter(Boolean) as string[])];
  const where = platforms.map((p) => (p.link ? `[${SCHEDULE_PLATFORM_NAMES[p.platform]}](${p.link})` : SCHEDULE_PLATFORM_NAMES[p.platform]));
  if (!where.length && s.link) where.push(`[Watch](${s.link})`);
  const sub = [games.length ? `🎮 ${games.join(", ")}` : "", ...where, tag ?? ""].filter(Boolean).join(" · ");
  if (sub) lines.push(`-# ${sub}`);
  if (s.message) lines.push(`-# 💬 ${s.message.replace(/\s*\n\s*/g, " ").slice(0, 140)}`);
  return lines.join("\n");
}

// Streams in a section, with a blank line between them.
function fitField(lines: string[]): string {
  let out = "";
  for (const l of lines) {
    if ((out ? out.length + 2 : 0) + l.length > 1020) {
      out += out ? "\n…" : "…";
      break;
    }
    out += (out ? "\n\n" : "") + l;
  }
  return out;
}

// The schedule post's sections: the regular daily/weekday/weekend streams,
// then the next 7 days by date, then later one-time and monthly streams.
export function buildScheduleBoard(slots: BoardSlot[], timeZone: string, from = new Date()) {
  const tz = isValidTimezone(timeZone) ? timeZone : "UTC";
  const fields: Array<{ name: string; value: string }> = [];
  const regular = slots.filter((s) => ["DAILY", "WEEKDAYS", "WEEKENDS"].includes(cleanRepeat(s.repeat)));
  if (regular.length) {
    const lines = regular
      .sort((a, b) => a.startMinutes - b.startMinutes)
      .map((s) => {
        const next = nextOccurrence(tz, s, from, s.durationMin * 60_000);
        const label = REPEAT_LABELS[cleanRepeat(s.repeat)].replace(/ \(.*\)$/, "").toLowerCase();
        return next ? boardLine(s, next, "", label) : "";
      })
      .filter(Boolean);
    if (lines.length) fields.push({ name: "🔁 Regular streams", value: fitField(lines) });
  }

  const others = slots.filter((s) => !regular.includes(s));
  const zoned = new Date(from.getTime() + zoneOffsetMs(from.getTime(), tz));
  const dayStart = (add: number) => new Date(wallInstant(tz, zoned.getUTCFullYear(), zoned.getUTCMonth(), zoned.getUTCDate() + add, 0));
  const shownThisWeek = new Set<string>();
  for (let i = 0; i < 7; i++) {
    const start = dayStart(i), end = dayStart(i + 1);
    const today = others
      .flatMap((s) => occurrencesBetween(tz, s, i === 0 ? new Date(Math.max(start.getTime(), from.getTime() - s.durationMin * 60_000)) : start, end).map((at) => ({ s, at })))
      .sort((a, b) => a.at.getTime() - b.at.getTime());
    if (!today.length) continue;
    today.forEach(({ s }) => shownThisWeek.add(s.id));
    const date = new Date(Date.UTC(zoned.getUTCFullYear(), zoned.getUTCMonth(), zoned.getUTCDate() + i));
    const short = date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    const name = `📆 ${i === 0 ? "Today" : i === 1 ? "Tomorrow" : DAY_NAMES[date.getUTCDay()]} · ${i < 2 ? `${DAY_NAMES[date.getUTCDay()].slice(0, 3)} ` : ""}${short}`;
    fields.push({ name, value: fitField(today.map(({ s, at }) => boardLine(s, at, ""))) });
  }

  // Later one-time and monthly streams (anything already shown this week isn't repeated).
  const weekEnd = dayStart(7);
  const later = others
    .filter((s) => !shownThisWeek.has(s.id) && ["ONCE", "MONTHLY", "BIWEEKLY"].includes(cleanRepeat(s.repeat)))
    .map((s) => ({ s, at: nextOccurrence(tz, s, weekEnd) }))
    .filter((x): x is { s: BoardSlot; at: Date } => !!x.at && x.at.getTime() - weekEnd.getTime() < 45 * 86_400_000)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const dateIn = (at: Date) => at.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz });
  if (later.length) fields.push({ name: "🗓️ Coming up", value: fitField(later.map(({ s, at }) => boardLine(s, at, `${dateIn(at)} · <t:${Math.floor(at.getTime() / 1000)}:t>`))) });
  return fields.slice(0, 25);
}

// ---- The whole-week post: Monday to Sunday ----
const PLATFORM_DOT: Record<SchedulePlatform, string> = { twitch: "🟣", kick: "🟢", tiktok: "🎵", youtube: "🔴" };
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// The Monday the post covers: next week's (a week ahead), or this week's.
export function scheduleWeekStart(timeZone: string, weekAhead: boolean, from = new Date()): { y: number; m: number; d: number } {
  const tz = isValidTimezone(timeZone) ? timeZone : "UTC";
  const zoned = new Date(from.getTime() + zoneOffsetMs(from.getTime(), tz));
  const dow = zoned.getUTCDay();
  const back = (dow + 6) % 7; // days since this Monday
  const monday = new Date(Date.UTC(zoned.getUTCFullYear(), zoned.getUTCMonth(), zoned.getUTCDate() - back + (weekAhead ? 7 : 0)));
  return { y: monday.getUTCFullYear(), m: monday.getUTCMonth(), d: monday.getUTCDate() };
}

const fmtDay = (y: number, m: number, d: number, withDay = true) =>
  new Date(Date.UTC(y, m, d)).toLocaleDateString("en-US", { ...(withDay ? { weekday: "short" } : {}), month: "short", day: "numeric", timeZone: "UTC" });

// "Mon, Nov 30 – Sun, Dec 6"
export function scheduleWeekLabel(timeZone: string, weekAhead: boolean, from = new Date()): string {
  const s = scheduleWeekStart(timeZone, weekAhead, from);
  return `${fmtDay(s.y, s.m, s.d)} – ${fmtDay(s.y, s.m, s.d + 6)}`;
}

// A blank line under each day, so the days in the post have space between them.
const DAY_GAP = "\n​";

// One stream in the week post:
//   **7:00 PM** · **Draven** · Ranked to Champion
//   -# 🟢 Kick · 🎮 Rainbow Six Siege
function weekLine(s: BoardSlot, at: Date): string {
  const platforms = cleanSlotPlatforms(s.platforms);
  const head = `**<t:${Math.floor(at.getTime() / 1000)}:t>** · **${s.streamer}**${s.streamTitle ? ` · ${s.streamTitle}` : ""}`;
  const where = platforms.map((p) => `${PLATFORM_DOT[p.platform]} ${p.link ? `[${SCHEDULE_PLATFORM_NAMES[p.platform]}](${p.link})` : SCHEDULE_PLATFORM_NAMES[p.platform]}`);
  if (!where.length && s.link) where.push(`[Watch](${s.link})`);
  const games = [...new Set([s.title, ...platforms.map((p) => p.category)].filter(Boolean) as string[])];
  const sub = [...where, games.length ? `🎮 ${games.join(", ")}` : ""].filter(Boolean).join(" · ");
  const lines = [head];
  if (sub) lines.push(`-# ${sub}`);
  if (s.message) lines.push(`-# 💬 ${s.message.replace(/\s*\n\s*/g, " ").slice(0, 120)}`);
  return lines.join("\n");
}

// The week's sections, Monday to Sunday. Days with no streams fold together
// ("Thu – Fri · No streams") so a quiet week stays short.
export function buildWeekBoard(slots: BoardSlot[], timeZone: string, weekAhead: boolean, from = new Date()) {
  const tz = isValidTimezone(timeZone) ? timeZone : "UTC";
  // A week ahead: the rest of this week (from today), then all of next week,
  // so what's still coming up this week never drops off. Otherwise this week.
  if (weekAhead) {
    const zoned = new Date(from.getTime() + zoneOffsetMs(from.getTime(), tz));
    const today = { y: zoned.getUTCFullYear(), m: zoned.getUTCMonth(), d: zoned.getUTCDate() };
    const thisMon = scheduleWeekStart(tz, false, from);
    const nextMon = scheduleWeekStart(tz, true, from);
    const daysLeft = 7 - ((new Date(Date.UTC(today.y, today.m, today.d)).getUTCDay() + 6) % 7);
    const a = weekSection(slots, tz, today, daysLeft, from, true);
    const b = weekSection(slots, tz, nextMon, 7, from, false);
    const fields = [
      { name: "🗓️ This week", value: `-# ${fmtDay(today.y, today.m, today.d)} – ${fmtDay(thisMon.y, thisMon.m, thisMon.d + 6)}` },
      ...a.fields,
      { name: "🗓️ Next week", value: `-# ${fmtDay(nextMon.y, nextMon.m, nextMon.d)} – ${fmtDay(nextMon.y, nextMon.m, nextMon.d + 6)}` },
      ...b.fields,
    ];
    return { fields: fields.slice(0, 25), total: a.total + b.total, label: `${fmtDay(today.y, today.m, today.d)} – ${fmtDay(nextMon.y, nextMon.m, nextMon.d + 6)}` };
  }
  const mon = scheduleWeekStart(tz, false, from);
  const s = weekSection(slots, tz, mon, 7, from, true);
  return { fields: s.fields, total: s.total, label: scheduleWeekLabel(tz, false, from) };
}

// `days` days starting on `start`. On today, a stream that's live right now still shows.
function weekSection(slots: BoardSlot[], tz: string, start0: { y: number; m: number; d: number }, days: number, from: Date, includesToday: boolean) {
  const mon = start0;
  const fields: Array<{ name: string; value: string }> = [];
  let total = 0;
  let empty: Array<{ y: number; m: number; d: number }> = [];
  const flush = () => {
    if (!empty.length) return;
    const a = empty[0], b = empty[empty.length - 1];
    const dayA = SHORT_DAYS[new Date(Date.UTC(a.y, a.m, a.d)).getUTCDay()];
    const dayB = SHORT_DAYS[new Date(Date.UTC(b.y, b.m, b.d)).getUTCDay()];
    fields.push({ name: empty.length === 1 ? `${dayA} · ${fmtDay(a.y, a.m, a.d, false)}` : `${dayA} – ${dayB}`, value: `-# No streams${DAY_GAP}` });
    empty = [];
  };
  for (let i = 0; i < days; i++) {
    const day = new Date(Date.UTC(mon.y, mon.m, mon.d + i));
    const y = day.getUTCFullYear(), m = day.getUTCMonth(), d = day.getUTCDate();
    const start = new Date(wallInstant(tz, y, m, d, 0));
    const end = new Date(wallInstant(tz, y, m, d + 1, 0));
    const isToday = includesToday && from.getTime() >= start.getTime() && from.getTime() < end.getTime();
    const items = slots
      .flatMap((s) => occurrencesBetween(tz, s, isToday ? new Date(Math.max(start.getTime(), from.getTime() - s.durationMin * 60_000)) : start, end).map((at) => ({ s, at })))
      .sort((p, q) => p.at.getTime() - q.at.getTime());
    if (!items.length) {
      empty.push({ y, m, d });
      continue;
    }
    flush();
    total += items.length;
    fields.push({ name: `📆 ${isToday ? "Today · " : ""}${DAY_NAMES[day.getUTCDay()]} · ${fmtDay(y, m, d, false)}`, value: fitField(items.map(({ s, at }) => weekLine(s, at))) + DAY_GAP });
  }
  flush();
  return { fields, total };
}

// ---- One post per week ----
export const SCHEDULE_WEEKS_AHEAD = [
  { value: 0, label: "This week only" },
  { value: 1, label: "1 week out" },
  { value: 2, label: "2 weeks out" },
  { value: 3, label: "3 weeks out" },
  { value: 4, label: "A month out" },
] as const;
export const SCHEDULE_TIPS = "\n-# Times show in your time zone · Streamers, add yours with `/schedule add` in the bot commands channel";

export interface ScheduleWeek {
  index: number; // 0 = the active week
  when: string; // "This week", "Next week", "In 2 weeks"
  label: string; // "Fri, Nov 20 – Sun, Nov 22"
  fields: Array<{ name: string; value: string }>;
  total: number;
}

// The active week (today to Sunday) and then each following week, Monday to Sunday.
export function buildScheduleWeeks(slots: BoardSlot[], timeZone: string, weeksAhead: number, from = new Date()): ScheduleWeek[] {
  const tz = isValidTimezone(timeZone) ? timeZone : "UTC";
  const zoned = new Date(from.getTime() + zoneOffsetMs(from.getTime(), tz));
  const today = { y: zoned.getUTCFullYear(), m: zoned.getUTCMonth(), d: zoned.getUTCDate() };
  const mon = scheduleWeekStart(tz, false, from);
  const daysLeft = 7 - ((new Date(Date.UTC(today.y, today.m, today.d)).getUTCDay() + 6) % 7);
  const out: ScheduleWeek[] = [];
  for (let i = 0; i <= Math.max(0, Math.min(4, Math.round(weeksAhead))); i++) {
    const start = i === 0 ? today : { y: mon.y, m: mon.m, d: mon.d + 7 * i };
    const s = weekSection(slots, tz, start, i === 0 ? daysLeft : 7, from, i === 0);
    const first = new Date(Date.UTC(start.y, start.m, start.d));
    const sunday = new Date(Date.UTC(mon.y, mon.m, mon.d + 7 * i + 6));
    out.push({
      index: i,
      when: i === 0 ? "This week" : i === 1 ? "Next week" : `In ${i} weeks`,
      label: `${fmtDay(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate())} – ${fmtDay(sunday.getUTCFullYear(), sunday.getUTCMonth(), sunday.getUTCDate())}`,
      fields: s.fields.length ? s.fields.slice(0, 25) : [{ name: "No streams", value: "-# Nothing scheduled this week yet" }],
      total: s.total,
    });
  }
  return out;
}

export const SCHEDULE_POST_DEFAULTS = {
  // One of these per week. {tips} is only filled in on the active (bottom) week.
  title: "📅 {when}",
  description: "**{week}** · {count}{tips}",
  footer: "",
  color: "#5865F2",
};

export interface ScheduleSlot {
  id: string;
  streamer: string;
  title?: string | null;
  link?: string | null;
  dayOfWeek: number;
  startMinutes: number;
  durationMin: number;
}

// The schedule message's text: a block per day, each time shown with Discord's
// own time tag so everyone sees it in their own time zone.
export function buildScheduleText(slots: ScheduleSlot[], timeZone: string, from = new Date()) {
  const lines: Array<{ day: string; value: string }> = [];
  for (const d of SCHEDULE_DAY_ORDER) {
    const todays = slots.filter((s) => s.dayOfWeek === d).sort((a, b) => a.startMinutes - b.startMinutes);
    if (!todays.length) continue;
    const value = todays
      .map((s) => {
        const start = Math.floor(nextSlotStart(timeZone, d, s.startMinutes, from).getTime() / 1000);
        const what = s.title ? ` · ${s.title}` : "";
        const who = s.link ? `[${s.streamer}](${s.link})` : s.streamer;
        return `<t:${start}:t> **${who}**${what}`;
      })
      .join("\n");
    lines.push({ day: DAY_NAMES[d], value });
  }
  return lines;
}

// Twitch clips and rewards.
export const CLIP_VOTE_PREFIX = "clipv:";

// A short code to type once in a live Twitch chat. No look-alike characters.
export function makeLinkCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `SPART-${s}`;
}

export const LINK_CODE_PATTERN = /SPART-[A-HJ-NP-Z2-9]{6}/;

export function cleanTwitchLogin(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?twitch\.tv\//, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "");
}

export const TWITCH_LOGIN = /^[a-z0-9_]{3,25}$/;
