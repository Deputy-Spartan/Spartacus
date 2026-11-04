// The "What are you playing?" menu in a new squad channel. Picking a game
// renames the channel to that game's name format and can set its limit.
export interface TempGameChoice {
  label: string;
  emoji?: string;
  nameFormat: string;
  userLimit?: number;
}

export const MAX_TEMP_GAMES = 24;

// Keeps only usable rows: a game name, a channel name and a 0 to 99 limit.
export function cleanTempGameChoices(raw: unknown): TempGameChoice[] {
  if (!Array.isArray(raw)) return [];
  const out: TempGameChoice[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const label = String((r as any).label ?? "").trim().slice(0, 80);
    if (!label) continue;
    const emoji = String((r as any).emoji ?? "").trim().slice(0, 32);
    const nameFormat = String((r as any).nameFormat ?? "").trim().slice(0, 90) || `${emoji ? emoji + " " : ""}${label}`;
    const limit = Math.round(Number((r as any).userLimit) || 0);
    out.push({ label, ...(emoji ? { emoji } : {}), nameFormat, userLimit: Math.min(99, Math.max(0, limit)) });
    if (out.length === MAX_TEMP_GAMES) break;
  }
  return out;
}

// A server emoji token, like <:siege:123> or <a:fire:456>.
export const SERVER_EMOJI = /<(a?):(\w{2,32}):(\d{15,25})>/;

// Fills {user}, {index} or {count}, and {guild} in a channel name. Discord
// channel names only take standard emojis, so server emojis are dropped.
export function fillTempName(format: string, tokens: { user: string; index: number; guild: string }): string {
  return format
    .replace(new RegExp(SERVER_EMOJI.source, "g"), "")
    .replace(/{user}/g, tokens.user)
    .replace(/{index}|{count}/g, String(tokens.index))
    .replace(/{guild}/g, tokens.guild)
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 100);
}

// The step-by-step guide behind the "How it works" buttons. {lobby} and
// {panel} become links to the lobby voice channel and the panel's channel.
export const TEMP_GUIDE_DEFAULT = [
  "**There are two ways to get your own voice channel.**",
  "",
  "**1️⃣ Join to create**",
  "Join {lobby}. Spartacus makes your own voice channel and moves you into it.",
  "",
  "**2️⃣ Pick your game**",
  "Pick your game in the dropdown on {panel}. Your channel is made, named for that game, and put in that game's category. If you're already in voice, you're moved in. If not, you get a link and 2 minutes to join.",
  "",
  "**🎮 Naming your channel**",
  "A channel made by joining shows a *What are you playing?* menu in its chat. Pick a game to rename it, like 🟧 R6 Squad 1, and set that game's player limit. Or pick ✏️ Custom name to type your own.",
  "",
  "**🛠️ Your channel's buttons**",
  "Open your voice channel's chat (the 💬 next to the channel name) to find them. Only the person who made the channel can use them.",
  "🔒 **Lock / Unlock**: locking lets only the people inside right now join. Unlock opens it to everyone again.",
  "✏️ **Rename**: type a new name for the channel.",
  "👥 **Limit**: set how many people can join, from 1 to 99, or 0 for no limit.",
  "❓ **How it works**: shows this guide.",
  "",
  "**🧹 When you're done**",
  "Just leave. The channel deletes itself once it's empty, and so does its game category when no squads are left in it. You can have one squad at a time.",
  "",
  "**ℹ️ Good to know**",
  "Discord allows 2 renames per channel every 10 minutes, so a rename can take a few minutes to show.",
].join("\n");
