// Turns a voice channel name template into a real name. The bot and the
// dashboard preview both use this, so the preview always matches Discord.
export interface VoiceNameValues {
  a: string; // first player or team
  b: string;
  team?: string; // the team this channel belongs to
  game: string;
  map?: string | null;
  number: number;
  pad: number; // digits in the number, so 3 turns 7 into 007
}

export const VOICE_TOKENS = [
  { token: "{a}", label: "First side" },
  { token: "{b}", label: "Second side" },
  { token: "{team}", label: "Team" },
  { token: "{game}", label: "Game" },
  { token: "{map}", label: "Map" },
  { token: "{number}", label: "Number" },
] as const;

export const DEFAULT_DUEL_VOICE_NAME = "{a} vs {b}";
export const DEFAULT_TEAM_VOICE_NAME = "{team}";

export const DEFAULT_TEXT_ROOM_NAME = "match-{number}-{a}-vs-{b}";

// Text channels can't have spaces or capitals, so Discord would change them anyway.
export function renderTextRoomName(template: string, v: VoiceNameValues): string {
  const name = renderVoiceName(template, v)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (name || "match").slice(0, 100);
}

export function renderVoiceName(template: string, v: VoiceNameValues): string {
  const name = template
    .replace(/\{a\}/g, v.a)
    .replace(/\{b\}/g, v.b)
    .replace(/\{team\}/g, v.team ?? `${v.a} vs ${v.b}`)
    .replace(/\{game\}/g, v.game)
    .replace(/\{map\}/g, v.map ?? "")
    .replace(/\{number\}/g, String(v.number).padStart(v.pad, "0"))
    .replace(/\s+/g, " ")
    .trim();
  return (name || `${v.a} vs ${v.b}`).slice(0, 100);
}
