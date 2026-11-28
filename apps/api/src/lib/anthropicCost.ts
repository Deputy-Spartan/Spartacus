import { prisma } from "@spartacus/db";
import { aiUsageMonth } from "@spartacus/shared";

// Real spending from Anthropic, for Command Center › AI Usage. Reads the
// organization's cost report with an Admin API key (ANTHROPIC_ADMIN_KEY in
// Render). This report isn't in the Anthropic SDK, so it's a plain HTTP call.
// It covers every API key in the organization, in UTC days.

export type RealCost =
  | { configured: false }
  | { configured: true; ok: false; error: string }
  | { configured: true; ok: true; month: string; monthMicros: number; searchMicros: number; days: Array<{ day: string; micros: number }>; checkedAt: string };

let cache: { at: number; value: RealCost } | null = null;
const FRESH_MS = 10 * 60_000; // Anthropic asks for at most about one poll a minute; 10 minutes is plenty here

interface CostResult {
  amount: string; // cents, as a decimal string
  cost_type: string | null;
}
interface CostPage {
  data: Array<{ starting_at: string; ending_at: string; results: CostResult[] }>;
  has_more: boolean;
  next_page: string | null;
}

export async function realCost(force = false): Promise<RealCost> {
  const key = process.env.ANTHROPIC_ADMIN_KEY?.trim();
  if (!key) return { configured: false };
  if (!force && cache && Date.now() - cache.at < FRESH_MS) return cache.value;

  const month = aiUsageMonth();
  try {
    const days = new Map<string, number>();
    let searchMicros = 0;
    let page: string | null = null;
    for (let i = 0; i < 5; i++) {
      const qs = new URLSearchParams({ starting_at: `${month}-01T00:00:00Z`, bucket_width: "1d", limit: "31" });
      qs.append("group_by[]", "description");
      if (page) qs.set("page", page);
      const res = await fetch(`https://api.anthropic.com/v1/organizations/cost_report?${qs}`, {
        headers: { "x-api-key": key, "anthropic-version": "2026-10-21" },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 401 || res.status === 403) {
        return remember({ configured: true, ok: false, error: "Anthropic rejected the Admin key. Check ANTHROPIC_ADMIN_KEY in Render (it starts with sk-ant-admin)." });
      }
      if (!res.ok) return remember({ configured: true, ok: false, error: `Anthropic's cost report answered ${res.status}. Try again in a few minutes.` }, 60_000);
      const body = (await res.json()) as CostPage;
      for (const bucket of body.data ?? []) {
        const day = bucket.starting_at.slice(0, 10);
        for (const r of bucket.results ?? []) {
          const micros = Math.round(Number(r.amount) * 10_000); // cents → micro-dollars
          if (!Number.isFinite(micros)) continue;
          days.set(day, (days.get(day) ?? 0) + micros);
          if (r.cost_type === "web_search") searchMicros += micros;
        }
      }
      if (!body.has_more || !body.next_page) break;
      page = body.next_page;
    }
    const monthMicros = [...days.values()].reduce((s, v) => s + v, 0);
    const value: RealCost = {
      configured: true,
      ok: true,
      month,
      monthMicros,
      searchMicros,
      days: [...days.entries()].sort().map(([day, micros]) => ({ day, micros })),
      checkedAt: new Date().toISOString(),
    };
    // The bot reads this for the budget, so going over is caught even when the
    // key is also used outside the bot.
    await prisma.aiUsageSettings
      .upsert({ where: { id: "global" }, create: { id: "global", realMonth: month, realMicros: monthMicros, realAt: new Date() }, update: { realMonth: month, realMicros: monthMicros, realAt: new Date() } })
      .catch(() => null);
    return remember(value);
  } catch (err) {
    return remember({ configured: true, ok: false, error: `Couldn't reach Anthropic's cost report: ${err instanceof Error ? err.message : "unknown error"}` }, 60_000);
  }
}

function remember(value: RealCost, ttl = FRESH_MS) {
  cache = { at: Date.now() - (FRESH_MS - ttl), value };
  return value;
}

// Keep the real total fresh for the bot's budget check, even when nobody has the page open.
let timer: NodeJS.Timeout | null = null;
export function startRealCostRefresh() {
  if (timer || !process.env.ANTHROPIC_ADMIN_KEY?.trim()) return;
  timer = setInterval(() => void realCost(true).catch(() => null), 15 * 60_000);
  timer.unref?.();
  void realCost(true).catch(() => null);
}
