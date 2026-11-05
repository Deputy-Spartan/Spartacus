// The info boxes on the dashboard's front (sign-in) page. Owner Only → Front
// Page edits them; the defaults are what shows until anything is saved.

export interface FrontPageCard {
  icon: string; // a standard emoji
  title: string;
  short: string; // the line under the title
  details: string[]; // the ticked lines shown when the box is opened
}

export const FRONT_PAGE_LIMITS = { minCards: 2, maxCards: 8, icon: 8, title: 50, short: 90, detail: 200, maxDetails: 5 } as const;

export const FRONT_PAGE_DEFAULTS: FrontPageCard[] = [
  {
    icon: "🛡️",
    title: "Moderation & Automod",
    short: "Keep chat clean without watching it all day.",
    details: [
      "Automod for spam, links, caps, mass mentions and bad words, with warnings that escalate on their own.",
      "Anti-raid lockdown, anti-nuke protection and AI moderation for the stuff filters miss.",
      "Every action lands in a case log, with appeals your members can send from their DMs.",
    ],
  },
  {
    icon: "⚔️",
    title: "Matchmaking & leaderboards",
    short: "Queues, matches and rankings for your games.",
    details: [
      "1v1s, pickups and team matches with queues members join from a button.",
      "Results are reported and confirmed in Discord, and feed a live leaderboard per game.",
      "Teams, captains, tournaments and a Looking for a Team board.",
    ],
  },
  {
    icon: "🔊",
    title: "Temp squad channels",
    short: "Voice channels that appear when needed, gone when empty.",
    details: [
      "Join a lobby or pick a game from a panel to get your own squad channel.",
      "Squads are grouped into a category per game, and named from your settings.",
      "Owners can lock, rename and set the user limit from buttons, in the channel or a private thread.",
    ],
  },
  {
    icon: "🔴",
    title: "Going-live alerts",
    short: "Tell the server when your streamers go live.",
    details: [
      "Twitch, YouTube, Kick and TikTok are checked automatically. /golive covers every other site.",
      "Alerts show the title, game, viewers and a live preview, and update while they stream.",
      "Streamers get a Live Now role, and the alert becomes a summary when they stop.",
    ],
  },
  {
    icon: "🎭",
    title: "Roles, rules & verification",
    short: "Get new members in, set up and safe.",
    details: [
      "Role pickers with buttons, dropdowns or reactions, and a Role Manager for bulk and timed roles.",
      "A rules gate with an I Agree button, and verification with account-age checks and a captcha.",
      "Welcome messages, onboarding and join roles, all set up step by step.",
    ],
  },
  {
    icon: "📊",
    title: "Live stats & logs",
    short: "See what's happening at a glance.",
    details: [
      "Stat channels for member counts, plus growth, voice and suggestion analytics.",
      "A full server log: messages, members, roles, channels and moves, without the noise.",
      "Bump reminders, a status channel and a weekly staff report.",
    ],
  },
];

const line = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

// Cleans a saved list. Returns null when there's nothing usable, so the
// defaults show instead. Custom server emoji can't show on the website, so
// those (and blank icons) become a star.
export function cleanFrontPage(v: unknown): FrontPageCard[] | null {
  if (!Array.isArray(v)) return null;
  const L = FRONT_PAGE_LIMITS;
  const out: FrontPageCard[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    const title = line(c.title, L.title);
    if (!title) continue;
    let icon = line(c.icon, L.icon);
    if (!icon || /[<>:]/.test(icon)) icon = "⭐";
    const details = (Array.isArray(c.details) ? c.details : []).map((d) => line(d, L.detail)).filter(Boolean).slice(0, L.maxDetails);
    out.push({ icon, title, short: line(c.short, L.short), details });
    if (out.length >= L.maxCards) break;
  }
  return out.length >= L.minCards ? out : null;
}
