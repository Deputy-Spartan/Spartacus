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
