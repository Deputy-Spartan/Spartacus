// AI Usage (owner only): what each AI call cost, worked out from Anthropic's
// list prices. Shared by the bot (recording) and the API/dashboard (showing).

// Dollars per million tokens, by model id.
export const AI_PRICES: Record<string, { in: number; out: number }> = {
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
  "claude-opus-5-5": { in: 4, out: 20 },
  "claude-opus-4-8": { in: 5, out: 25 },
};
// Dollars per web search.
export const AI_SEARCH_PRICE = 0.01;

export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  searches: number;
}

/** Cost in micro-dollars ($1 = 1,000,000), split into the answer itself and its web searches. */
export function aiCostMicros(u: AiUsage): { total: number; search: number } {
  const p = AI_PRICES[u.model] ?? AI_PRICES["claude-sonnet-5-5"];
  const search = Math.round(u.searches * AI_SEARCH_PRICE * 1e6);
  const words = Math.round(u.inputTokens * p.in + u.outputTokens * p.out); // tokens × $/M = micro-dollars
  return { total: words + search, search };
}

// Days and months are counted in the owner's time zone.
export const AI_USAGE_TZ = "America/New_York";
export function aiUsageDay(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: AI_USAGE_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
export const aiUsageMonth = (d: Date = new Date()) => aiUsageDay(d).slice(0, 7);

export const AI_USAGE_KEEP_CHOICES = [7, 30, 90] as const;
export const AI_USAGE_ON_EMPTY = ["keep", "fast", "pause"] as const;
export type AiUsageOnEmpty = (typeof AI_USAGE_ON_EMPTY)[number];
export const AI_USAGE_DEFAULTS = { budgetCents: 1000, alert75: true, alert90: true, onEmpty: "fast" as AiUsageOnEmpty, keepDays: 30 };
