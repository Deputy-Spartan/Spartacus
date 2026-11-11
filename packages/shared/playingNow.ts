// Playing Now: a one-tap "I'm on, who wants to play?" with a role that clears itself.

export const PLAYING_NOW_DURATIONS = [30, 60, 120] as const;
export const PLAYING_NOW_MAX_MODES = 10;

export interface PlayingNowSettings {
  channelId: string | null;
  roleId: string | null;
  notifyRoleId: string | null;
  maxMinutes: number; // 30 | 60 | 120
  pingCooldown: number; // 10 | 20 | 30 | 60
  endOnVoiceLeave: boolean;
  modes: string[];
  matchmakingButton: boolean;
}

export const PLAYING_NOW_DEFAULTS: PlayingNowSettings = {
  channelId: null,
  roleId: null,
  notifyRoleId: null,
  maxMinutes: 120,
  pingCooldown: 20,
  endOnVoiceLeave: true,
  modes: ["Ranked", "Quick Match", "Unranked", "Arcade", "Customs"],
  matchmakingButton: true,
};

const snowflake = (v: unknown) => (typeof v === "string" && /^\d{15,25}$/.test(v) ? v : null);

export function cleanPlayingNowModes(v: unknown): string[] {
  const list = Array.isArray(v) ? v : [];
  const out: string[] = [];
  for (const m of list) {
    if (typeof m !== "string") continue;
    const t = m.replace(/\s+/g, " ").trim().slice(0, 40);
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length >= PLAYING_NOW_MAX_MODES) break;
  }
  return out.length ? out : [...PLAYING_NOW_DEFAULTS.modes];
}

export function cleanPlayingNow(b: Record<string, unknown>): PlayingNowSettings {
  const D = PLAYING_NOW_DEFAULTS;
  return {
    channelId: snowflake(b.channelId),
    roleId: snowflake(b.roleId),
    notifyRoleId: snowflake(b.notifyRoleId),
    maxMinutes: (PLAYING_NOW_DURATIONS as readonly number[]).includes(b.maxMinutes as number) ? (b.maxMinutes as number) : D.maxMinutes,
    pingCooldown: [10, 20, 30, 60].includes(b.pingCooldown as number) ? (b.pingCooldown as number) : D.pingCooldown,
    endOnVoiceLeave: typeof b.endOnVoiceLeave === "boolean" ? b.endOnVoiceLeave : D.endOnVoiceLeave,
    modes: cleanPlayingNowModes(b.modes),
    matchmakingButton: typeof b.matchmakingButton === "boolean" ? b.matchmakingButton : D.matchmakingButton,
  };
}
