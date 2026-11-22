// Stream Growth: countdowns, friends & raids, the live board, recaps, Viewer of
// the Week, game nights, the pre-stream checklist and chat ranks. The parts
// that don't touch Discord or the database live here, so the bot, the API and
// the dashboard agree on them.
import { nextSlotStart } from "./streamExtras";

export const STREAM_GROWTH_DEFAULTS = {
  countdownEnabled: false,
  countdownHour: true,
  countdownSoon: true,
  friendAlerts: true,
  raidListOnEnd: true,
  recapEnabled: false,
  recapLinkedOnly: true,
  votwEnabled: false,
  votwDay: 1,
  checklist: [] as string[],
};

// Used when a server hasn't written its own checklist.
export const DEFAULT_CHECKLIST = [
  "Title and game set",
  "Avatar showing in OBS",
  "Mic and game audio levels",
  "Game voice chat off stream",
  "Chat filters on",
  "Alerts working (send a test)",
  "Starting Soon screen up",
  "Live on Kick and TikTok",
  "Phone on do not disturb",
  "Drink nearby",
];
export const CHECKLIST_MAX = 15;

// Chat ranks: the roles members earn as their level goes up. Images live in
// apps/bot/assets/ranks/<file>.
export const CHAT_RANKS = [
  { name: "Recruit", level: 1, file: "01_Recruit.png", color: "#8a8f98" },
  { name: "Private", level: 5, file: "02_Private.png", color: "#a3a07a" },
  { name: "Corporal", level: 10, file: "03_Corporal.png", color: "#b89b5e" },
  { name: "Sergeant", level: 15, file: "04_Sergeant.png", color: "#c9a24a" },
  { name: "Lieutenant", level: 20, file: "05_Lieutenant.png", color: "#d4a93a" },
  { name: "Captain", level: 30, file: "06_Captain.png", color: "#e0b12c" },
  { name: "Major", level: 40, file: "07_Major.png", color: "#ebb81e" },
  { name: "Colonel", level: 50, file: "08_Colonel.png", color: "#f5c010" },
  { name: "General", level: 75, file: "09_General.png", color: "#ffd700" },
] as const;

// Buttons and menus all start with this.
export const SG_PREFIX = "sg:";

// The week label (Monday's date, UTC) used for Viewer of the Week.
export function utcWeek(at = new Date()): string {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// The next time a clock time comes round in a time zone: on a given weekday,
// or (with no day) today if it's still ahead, otherwise tomorrow.
export function nextTimeAt(timeZone: string, minutes: number, dayOfWeek: number | null, from = new Date()): Date {
  if (dayOfWeek !== null) return nextSlotStart(timeZone, dayOfWeek, minutes, from);
  let best: Date | null = null;
  for (let d = 0; d < 7; d++) {
    const t = nextSlotStart(timeZone, d, minutes, from);
    if (!best || t < best) best = t;
  }
  return best as Date;
}

// Splits players into teams of `size` (fair shuffle). Players left over when
// the numbers don't divide go on the smallest teams, so teams differ by at most one.
export function splitTeams<T>(players: T[], size: number, random: () => number = Math.random): T[][] {
  const list = [...players];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  if (size < 1 || list.length === 0) return [list];
  const count = Math.max(1, Math.round(list.length / size));
  const teams: T[][] = Array.from({ length: count }, () => []);
  list.forEach((p, i) => teams[i % count].push(p));
  return teams;
}

export const TEAM_NAMES = ["🟥 Red", "🟦 Blue", "🟩 Green", "🟨 Gold", "🟪 Purple", "🟧 Orange", "⬜ White", "⬛ Black"];

// Clip links people post in Discord.
export interface ClipLink {
  platform: "kick" | "twitch";
  clipId: string;
  streamer: string | null;
  url: string;
}

export function findClipLinks(text: string): ClipLink[] {
  const out: ClipLink[] = [];
  const seen = new Set<string>();
  const add = (c: ClipLink) => {
    const k = `${c.platform}:${c.clipId}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(c);
  };
  for (const m of text.matchAll(/https?:\/\/(?:www\.)?kick\.com\/([A-Za-z0-9_-]+)\/clips\/([A-Za-z0-9_-]+)/g))
    add({ platform: "kick", streamer: m[1], clipId: m[2], url: `https://kick.com/${m[1]}/clips/${m[2]}` });
  for (const m of text.matchAll(/https?:\/\/(?:www\.)?kick\.com\/([A-Za-z0-9_-]+)\?clip=([A-Za-z0-9_-]+)/g))
    add({ platform: "kick", streamer: m[1], clipId: m[2], url: `https://kick.com/${m[1]}/clips/${m[2]}` });
  for (const m of text.matchAll(/https?:\/\/clips\.twitch\.tv\/([A-Za-z0-9_-]+)/g)) add({ platform: "twitch", streamer: null, clipId: m[1], url: `https://clips.twitch.tv/${m[1]}` });
  for (const m of text.matchAll(/https?:\/\/(?:www\.|m\.)?twitch\.tv\/([A-Za-z0-9_]+)\/clip\/([A-Za-z0-9_-]+)/g))
    add({ platform: "twitch", streamer: m[1], clipId: m[2], url: `https://clips.twitch.tv/${m[2]}` });
  return out;
}

export const KICK_LOGIN = /^[a-z0-9_-]{3,25}$/;

export function cleanKickLogin(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?kick\.com\//, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "");
}

// What the bot asks Twitch and Kick for when a streamer connects.
export const TWITCH_SCOPES = ["channel:manage:broadcast", "moderator:read:followers"];
export const KICK_SCOPES = ["user:read", "channel:read", "channel:write", "events:subscribe"];
// Subs and gifted subs feed Overlays › Alerts and Subathon (bot/lib/streamTools.ts).
export const KICK_EVENTS = ["chat.message.sent", "channel.followed", "channel.subscription.new", "channel.subscription.renewal", "channel.subscription.gifts"];

// Rough time left, for the countdown posts.
export function minutesText(min: number): string {
  if (min >= 60) {
    const h = Math.round(min / 60);
    return h === 1 ? "1 hour" : `${h} hours`;
  }
  return min === 1 ? "1 minute" : `${min} minutes`;
}
