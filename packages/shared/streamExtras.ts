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
