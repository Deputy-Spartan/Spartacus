// Profile Cards: /profile draws a card members can customise and show off.
// Shared by the bot (drawing, the edit menu) and the dashboard (settings).

export interface ProfileTheme {
  id: string;
  name: string;
  from: string; // banner gradient
  to: string;
  accent: string; // XP bar and stat values
  unlockLevel?: number; // free from this level
  cost?: number; // or bought once with coins
}

export const PROFILE_THEMES: ProfileTheme[] = [
  { id: "midnight", name: "Midnight", from: "#1d2b55", to: "#4b6cd1", accent: "#6f8dff" },
  { id: "steel", name: "Steel", from: "#2a2f3a", to: "#7b8799", accent: "#9fb6d3" },
  { id: "ember", name: "Ember", from: "#5a1414", to: "#e0612b", accent: "#ff8a4c", unlockLevel: 10 },
  { id: "toxic", name: "Toxic", from: "#0f3d22", to: "#4cd964", accent: "#5fe38a", unlockLevel: 20 },
  { id: "royal", name: "Royal", from: "#2d1250", to: "#b07cff", accent: "#c59bff", unlockLevel: 40 },
  { id: "gold", name: "Gold", from: "#4a3304", to: "#f2c94c", accent: "#f2c94c", cost: 2000 },
];

export const PROFILE_TITLES = [
  "Member",
  "Rookie",
  "Breach Specialist",
  "Clutch King",
  "Support Main",
  "Shotcaller",
  "Entry Fragger",
  "Anchor",
  "Flex Player",
  "Sniper",
  "Strategist",
  "Grinder",
  "Content Creator",
  "Just Here for Fun",
] as const;

export const PROFILE_GAMES = [
  "Rainbow Six Siege",
  "Valorant",
  "Apex Legends",
  "Fortnite",
  "Call of Duty",
  "Counter-Strike 2",
  "Overwatch 2",
  "Rocket League",
  "League of Legends",
  "Minecraft",
  "GTA Online",
  "Marvel Rivals",
  "Destiny 2",
  "The Finals",
  "Helldivers 2",
  "EA FC",
] as const;

// Stats a server can show (up to 6 at a time).
export const PROFILE_STATS = {
  rank: "Leaderboard rank",
  voice: "Hours in voice",
  matches: "Match record (wins and losses)",
  coins: "Coins",
  invites: "Invites",
  achievements: "Achievements earned",
  streak: "Daily streak",
} as const;
export type ProfileStatKey = keyof typeof PROFILE_STATS;
export const DEFAULT_PROFILE_STATS: ProfileStatKey[] = ["rank", "voice", "matches", "coins", "invites", "achievements"];
export const MAX_PROFILE_STATS = 6;
export const PROFILE_BIO_MAX = 80;
export const MAX_PROFILE_BADGES = 3;
export const MAX_PROFILE_GAMES = 3;

// Built-in achievements, as badges. Custom ones use their own emoji and name.
export const BUILTIN_BADGES: Record<string, { emoji: string; label: string }> = {
  FIRST_MESSAGE: { emoji: "💬", label: "First Message" },
  LEVEL_10: { emoji: "🔟", label: "Level 10" },
  LEVEL_25: { emoji: "🚀", label: "Level 25" },
  LEVEL_50: { emoji: "👑", label: "Level 50" },
  STREAK_7: { emoji: "🔥", label: "7-Day Streak" },
  STREAK_30: { emoji: "☄️", label: "30-Day Streak" },
  VOICE_10H: { emoji: "🎙️", label: "10h in Voice" },
  VOICE_50H: { emoji: "🎧", label: "50h in Voice" },
};

// The button panel (an embed with "My card" / "Someone's card" buttons).
export const PROFILE_PANEL_DEFAULTS = {
  panelTitle: "🪪 Profile Cards",
  panelText: "See your profile card, or anyone else's. No commands needed.\n\n**🪪 My card** shows yours.\n**🔍 Someone's card** lets you pick a member.\n\nPress ✏️ Edit my card under your card to change your title, theme, badges, games and bio.",
  panelColor: "#5865F2",
  panelPublic: false,
};

export function cleanProfileStats(input: unknown): ProfileStatKey[] {
  if (!Array.isArray(input)) return DEFAULT_PROFILE_STATS;
  const keys = input.filter((k): k is ProfileStatKey => typeof k === "string" && k in PROFILE_STATS);
  return [...new Set(keys)].slice(0, MAX_PROFILE_STATS);
}
