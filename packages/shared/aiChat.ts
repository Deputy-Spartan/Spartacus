// AI Chat limits, shared by the API (validation) and the dashboard (choices).

// Questions each member can ask per window. 0 = no limit.
export const AI_CHAT_LIMIT_CHOICES = [0, 1, 2, 3, 5, 10, 15, 20, 30] as const;
// Window lengths in seconds.
export const AI_CHAT_WINDOW_CHOICES = [30, 60, 300, 600, 1800, 3600] as const;
// Discord's own slowmode steps, in seconds (0 = off).
export const SLOWMODE_CHOICES = [0, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600] as const;

// Which Claude model answers. "smart" is better at searching and judging answers; "fast" is cheaper.
export const AI_CHAT_MODELS = {
  smart: { id: "claude-sonnet-5-5", name: "Smarter (Claude Sonnet 5.5)" },
  fast: { id: "claude-haiku-5-5", name: "Fast & cheap (Claude Haiku 5.5)" },
} as const;
export type AiChatModel = keyof typeof AI_CHAT_MODELS;
// Web searches allowed per question.
export const AI_CHAT_SEARCH_CHOICES = [1, 2, 3, 5] as const;

export const AI_CHAT_DEFAULTS = {
  chatLimit: 5,
  chatLimitWindow: 60,
  chatStaffExempt: true,
  chatSlowmode: 0,
  chatRequireMention: false,
  chatModel: "smart" as AiChatModel,
  chatWebSearch: true,
  chatMaxSearches: 3,
};

export function formatSeconds(s: number): string {
  if (s <= 0) return "Off";
  if (s < 60) return `${s} second${s === 1 ? "" : "s"}`;
  if (s < 3600) return `${s / 60} minute${s === 60 ? "" : "s"}`;
  return `${s / 3600} hour${s === 3600 ? "" : "s"}`;
}
