import type { Client } from "discord.js";
import { Prisma } from "@spartacus/db";
import { AI_USAGE_DEFAULTS, aiCostMicros, aiUsageDay, aiUsageMonth, type AiUsage, type AiUsageOnEmpty } from "@spartacus/shared";
import { prisma } from "./prisma";

// AI Usage (owner only, Command Center › AI Usage): every AI Chat question is
// logged with its cost, AI Moderation is counted per day, and the month's
// spend is checked against the owner's budget.

type Settings = { budgetCents: number; alert75: boolean; alert90: boolean; onEmpty: AiUsageOnEmpty; keepDays: number };

let cache: { at: number; settings: Settings; spentMicros: number } | null = null;

async function load(): Promise<{ settings: Settings; spentMicros: number }> {
  if (cache && Date.now() - cache.at < 60_000) return cache;
  const [row, sum] = await Promise.all([
    prisma.aiUsageSettings.findUnique({ where: { id: "global" } }).catch(() => null),
    prisma.aiUsageDay.aggregate({ where: { day: { startsWith: aiUsageMonth() } }, _sum: { costMicros: true } }).catch(() => null),
  ]);
  const settings: Settings = row ? { ...row, onEmpty: row.onEmpty as AiUsageOnEmpty } : { ...AI_USAGE_DEFAULTS };
  // Anthropic's real total (kept fresh by the API when an Admin key is set)
  // wins when it's higher, e.g. when the key is also used outside the bot.
  const real = row && row.realMonth === aiUsageMonth() ? row.realMicros : 0;
  cache = { at: Date.now(), settings, spentMicros: Math.max(sum?._sum.costMicros ?? 0, real) };
  return cache;
}

/** Called after the owner saves settings, so a new budget applies at once. */
export function forgetAiUsageCache() {
  cache = null;
}

/** What AI Chat should do right now: "ok", answer with the cheap model ("fast"), or not at all ("pause"). */
export async function aiBudgetState(): Promise<"ok" | "fast" | "pause"> {
  const { settings, spentMicros } = await load();
  if (settings.budgetCents <= 0 || spentMicros < settings.budgetCents * 10_000) return "ok";
  return settings.onEmpty === "keep" ? "ok" : settings.onEmpty;
}

async function addDay(guildId: string, kind: "chat" | "mod", add: { count?: number; failed?: number; flagged?: number; usage?: AiUsage }) {
  const cost = add.usage ? aiCostMicros(add.usage) : { total: 0, search: 0 };
  const inc = {
    count: add.count ?? 0,
    failed: add.failed ?? 0,
    flagged: add.flagged ?? 0,
    searches: add.usage?.searches ?? 0,
    inputTokens: add.usage?.inputTokens ?? 0,
    outputTokens: add.usage?.outputTokens ?? 0,
    costMicros: cost.total,
    searchMicros: cost.search,
  };
  const day = aiUsageDay();
  await prisma.aiUsageDay.upsert({
    where: { day_guildId_kind: { day, guildId, kind } },
    create: { day, guildId, kind, ...inc },
    update: Object.fromEntries(Object.entries(inc).map(([k, v]) => [k, { increment: v }])),
  });
  if (cache) cache.spentMicros += cost.total;
  return cost.total;
}

export interface ChatRecord {
  guildId: string;
  userId: string;
  userName: string;
  channelId: string;
  channelName: string;
  question: string;
  answer?: string | null;
  sources?: Array<{ url: string; title: string }>;
  model: string;
  usage?: AiUsage;
  fail?: string | null;
}

/** One AI Chat question: answered, skipped or failed. Never throws. */
export async function recordAiChat(client: Client, r: ChatRecord) {
  try {
    const cost = await addDay(r.guildId, "chat", { count: 1, failed: r.fail ? 1 : 0, usage: r.usage });
    await prisma.aiUsageLog.create({
      data: {
        guildId: r.guildId,
        userId: r.userId,
        userName: r.userName.slice(0, 100),
        channelId: r.channelId,
        channelName: r.channelName.slice(0, 100),
        question: r.question.slice(0, 2000),
        answer: r.answer?.slice(0, 4000) ?? null,
        sources: r.sources?.length ? (r.sources as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        model: r.usage?.model ?? r.model,
        searches: r.usage?.searches ?? 0,
        inputTokens: r.usage?.inputTokens ?? 0,
        outputTokens: r.usage?.outputTokens ?? 0,
        costMicros: cost,
        fail: r.fail ?? null,
      },
    });
    if (cost > 0) await checkAlerts(client);
    void cleanup();
  } catch (err) {
    console.error("[ai-usage] couldn't record a chat question:", err instanceof Error ? err.message : err);
  }
}

/** One AI Moderation check. Counted per day only (there are a lot). Never throws. */
export async function recordAiModeration(client: Client, guildId: string, usage: AiUsage | undefined, flagged: boolean) {
  try {
    const cost = await addDay(guildId, "mod", { count: 1, flagged: flagged ? 1 : 0, usage });
    if (cost > 0) await checkAlerts(client);
  } catch (err) {
    console.error("[ai-usage] couldn't record a moderation check:", err instanceof Error ? err.message : err);
  }
}

// DMs the owner once a month at 75% and at 90% of the budget.
async function checkAlerts(client: Client) {
  const { settings, spentMicros } = await load();
  if (settings.budgetCents <= 0) return;
  const pct = spentMicros / (settings.budgetCents * 10_000);
  const level = pct >= 0.9 && settings.alert90 ? 90 : pct >= 0.75 && settings.alert75 ? 75 : 0;
  if (!level) return;
  const month = aiUsageMonth();
  const row = await prisma.aiUsageSettings.upsert({ where: { id: "global" }, create: { id: "global" }, update: {} });
  const sent75 = row.alertMonth === month && row.sent75;
  const sent90 = row.alertMonth === month && row.sent90;
  if ((level === 90 && sent90) || (level === 75 && (sent75 || sent90))) return;
  // Claim it first, so two messages at once don't both send the DM.
  const claimed = await prisma.aiUsageSettings.updateMany({
    where: { id: "global", alertMonth: row.alertMonth, sent75: row.sent75, sent90: row.sent90 },
    data: { alertMonth: month, sent75: true, sent90: level === 90 },
  });
  if (!claimed.count) return;
  const ownerId = process.env.OWNER_DISCORD_ID;
  if (!ownerId) return;
  const spent = (spentMicros / 1e6).toFixed(2);
  const budget = (settings.budgetCents / 100).toFixed(2);
  const then =
    settings.onEmpty === "pause"
      ? "When it runs out, AI Chat pauses until the 1st."
      : settings.onEmpty === "fast"
        ? "When it runs out, AI Chat switches to Fast & cheap until the 1st."
        : "When it runs out, AI Chat keeps going.";
  const user = await client.users.fetch(ownerId).catch(() => null);
  await user
    ?.send(`${level === 90 ? "⛔" : "⚠️"} **AI Usage: ${Math.floor(pct * 100)}% of this month's budget used** ($${spent} of $${budget}). ${then}\nSee it in the dashboard: Command Center › AI Usage.`)
    .catch(() => null);
}

// Deletes logged questions older than the owner's "keep for" setting, at most once an hour.
let lastCleanup = 0;
async function cleanup() {
  if (Date.now() - lastCleanup < 3_600_000) return;
  lastCleanup = Date.now();
  const { settings } = await load();
  const before = new Date(Date.now() - settings.keepDays * 86_400_000);
  await prisma.aiUsageLog.deleteMany({ where: { createdAt: { lt: before } } }).catch(() => null);
}
