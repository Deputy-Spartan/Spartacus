import { Router } from "express";
import { Prisma, prisma } from "@spartacus/db";
import { AI_USAGE_DEFAULTS, AI_USAGE_KEEP_CHOICES, AI_USAGE_ON_EMPTY, AI_USAGE_TZ, aiUsageDay, aiUsageMonth } from "@spartacus/shared";
import { requireAuth } from "../middleware/requireAuth";
import { requireOwner } from "../middleware/requireOwner";

// AI Usage (Command Center › AI Usage): what AI Chat and AI Moderation cost
// across every server, the monthly budget, and the log of every question.
// Owner only: the API key and the bill are the owner's.
const router = Router();

type Period = "today" | "7" | "month";
const periodOf = (v: unknown): Period => (v === "today" || v === "7" ? v : "month");

// Midnight at the start of a YYYY-MM-DD day in the owner's time zone.
function zonedMidnight(day: string): Date {
  const guess = new Date(`${day}T00:00:00Z`);
  const shown = new Date(guess.toLocaleString("en-US", { timeZone: AI_USAGE_TZ }));
  return new Date(guess.getTime() + (guess.getTime() - shown.getTime()));
}

// The days a period covers, oldest first.
function daysOf(p: Period): string[] {
  const today = aiUsageDay();
  if (p === "today") return [today];
  if (p === "7") return Array.from({ length: 7 }, (_, i) => aiUsageDay(new Date(Date.now() - (6 - i) * 86_400_000)));
  const n = Number(today.slice(8, 10));
  return Array.from({ length: n }, (_, i) => `${today.slice(0, 8)}${String(i + 1).padStart(2, "0")}`);
}

async function settingsRow() {
  const row = await prisma.aiUsageSettings.findUnique({ where: { id: "global" } });
  return row ?? { id: "global", ...AI_USAGE_DEFAULTS, alertMonth: "", sent75: false, sent90: false };
}

router.get("/owner/ai-usage", requireAuth, requireOwner, async (req, res) => {
  const period = periodOf(req.query.period);
  const guildId = typeof req.query.guildId === "string" && req.query.guildId ? req.query.guildId : undefined;
  const days = daysOf(period);
  // The chart always shows at least a week.
  const chartDays = period === "today" ? daysOf("7") : days;
  const since = zonedMidnight(days[0]);
  const g = guildId ? { guildId } : {};

  const [settings, monthSum, dayRows, chartRows, logModels, askers, servers] = await Promise.all([
    settingsRow(),
    prisma.aiUsageDay.aggregate({ where: { day: { startsWith: aiUsageMonth() } }, _sum: { costMicros: true } }),
    prisma.aiUsageDay.findMany({ where: { day: { in: days }, ...g } }),
    prisma.aiUsageDay.findMany({ where: { day: { in: chartDays }, ...g } }),
    prisma.aiUsageLog.groupBy({ by: ["model"], where: { createdAt: { gte: since }, ...g }, _sum: { costMicros: true }, _count: true }),
    prisma.aiUsageLog.groupBy({
      by: ["userId", "userName"],
      where: { createdAt: { gte: since }, ...g },
      _sum: { costMicros: true },
      _count: true,
      orderBy: { _sum: { costMicros: "desc" } },
      take: 8,
    }),
    prisma.aiUsageDay.groupBy({ by: ["guildId"], where: { day: { in: days } }, _sum: { costMicros: true } }),
  ]);

  const sum = (rows: typeof dayRows, kind: string, k: "count" | "failed" | "flagged" | "searches" | "costMicros" | "searchMicros") =>
    rows.filter((r) => r.kind === kind).reduce((s, r) => s + r[k], 0);

  const names = await prisma.guild.findMany({ where: { id: { in: servers.map((s) => s.guildId) } }, select: { id: true, name: true } });
  const nameOf = (id: string) => names.find((n) => n.id === id)?.name ?? "Unknown server";

  res.json({
    period,
    settings: { budgetCents: settings.budgetCents, alert75: settings.alert75, alert90: settings.alert90, onEmpty: settings.onEmpty, keepDays: settings.keepDays },
    month: aiUsageMonth(),
    monthSpentMicros: monthSum._sum.costMicros ?? 0,
    // Day of the month and days in it, for "at this pace".
    dayOfMonth: Number(aiUsageDay().slice(8, 10)),
    daysInMonth: new Date(Number(aiUsageMonth().slice(0, 4)), Number(aiUsageMonth().slice(5, 7)), 0).getDate(),
    totals: {
      spentMicros: dayRows.reduce((s, r) => s + r.costMicros, 0),
      asked: sum(dayRows, "chat", "count"),
      failed: sum(dayRows, "chat", "failed"),
      searches: sum(dayRows, "chat", "searches"),
      chatMicros: sum(dayRows, "chat", "costMicros"),
      searchMicros: sum(dayRows, "chat", "searchMicros"),
      modChecks: sum(dayRows, "mod", "count"),
      modFlagged: sum(dayRows, "mod", "flagged"),
      modMicros: sum(dayRows, "mod", "costMicros"),
    },
    chart: chartDays.map((day) => {
      const rows = chartRows.filter((r) => r.day === day);
      return {
        day,
        asked: sum(rows, "chat", "count"),
        answerMicros: sum(rows, "chat", "costMicros") - sum(rows, "chat", "searchMicros"),
        searchMicros: sum(rows, "chat", "searchMicros"),
        modMicros: sum(rows, "mod", "costMicros"),
      };
    }),
    byModel: logModels.map((m) => ({ model: m.model, costMicros: m._sum.costMicros ?? 0, count: m._count })),
    topAskers: askers.map((a) => ({ userId: a.userId, userName: a.userName, costMicros: a._sum.costMicros ?? 0, count: a._count })),
    byServer: servers
      .map((s) => ({ guildId: s.guildId, name: nameOf(s.guildId), costMicros: s._sum.costMicros ?? 0 }))
      .sort((a, b) => b.costMicros - a.costMicros),
  });
});

// The log, newest first, 40 at a time ("before" = the createdAt of the last row shown).
router.get("/owner/ai-usage/log", requireAuth, requireOwner, async (req, res) => {
  const period = periodOf(req.query.period);
  const days = daysOf(period);
  const guildId = typeof req.query.guildId === "string" && req.query.guildId ? req.query.guildId : undefined;
  const filter = typeof req.query.filter === "string" ? req.query.filter : "all";
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";

  // AI Moderation is kept as daily totals, one row per server per day.
  if (filter === "mod") {
    const rows = await prisma.aiUsageDay.findMany({ where: { kind: "mod", day: { in: days }, ...(guildId ? { guildId } : {}) }, orderBy: { day: "desc" }, take: 200 });
    const names = await prisma.guild.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.guildId))] } }, select: { id: true, name: true } });
    return res.json({
      rows: rows.map((r) => ({
        id: `mod:${r.id}`,
        kind: "mod",
        day: r.day,
        guildName: names.find((n) => n.id === r.guildId)?.name ?? "Unknown server",
        checks: r.count,
        flagged: r.flagged,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        costMicros: r.costMicros,
      })),
      more: false,
    });
  }

  const before = typeof req.query.before === "string" ? new Date(req.query.before) : null;
  const where: Prisma.AiUsageLogWhereInput = {
    createdAt: { gte: zonedMidnight(days[0]), ...(before && !isNaN(before.getTime()) ? { lt: before } : {}) },
    ...(guildId ? { guildId } : {}),
    ...(filter === "search" ? { searches: { gt: 0 } } : filter === "fail" ? { fail: { not: null } } : {}),
    ...(q
      ? { OR: [{ question: { contains: q, mode: "insensitive" } }, { answer: { contains: q, mode: "insensitive" } }, { userName: { contains: q, mode: "insensitive" } }] }
      : {}),
  };
  const rows = await prisma.aiUsageLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 41,
    select: { id: true, guildId: true, userName: true, channelName: true, question: true, model: true, searches: true, costMicros: true, fail: true, createdAt: true },
  });
  const names = await prisma.guild.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.guildId))] } }, select: { id: true, name: true } });
  res.json({
    rows: rows.slice(0, 40).map((r) => ({ ...r, kind: "chat", guildName: names.find((n) => n.id === r.guildId)?.name ?? "Unknown server" })),
    more: rows.length > 40,
  });
});

router.get("/owner/ai-usage/log/:id", requireAuth, requireOwner, async (req, res) => {
  const row = await prisma.aiUsageLog.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: "That message isn't in the log anymore." });
  const g = await prisma.guild.findUnique({ where: { id: row.guildId }, select: { name: true } });
  res.json({ ...row, guildName: g?.name ?? "Unknown server" });
});

router.put("/owner/ai-usage/settings", requireAuth, requireOwner, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const before = await settingsRow();
  const data = {
    budgetCents: typeof body.budgetCents === "number" && body.budgetCents >= 0 ? Math.min(1_000_000, Math.round(body.budgetCents)) : before.budgetCents,
    alert75: typeof body.alert75 === "boolean" ? body.alert75 : before.alert75,
    alert90: typeof body.alert90 === "boolean" ? body.alert90 : before.alert90,
    onEmpty: typeof body.onEmpty === "string" && (AI_USAGE_ON_EMPTY as readonly string[]).includes(body.onEmpty) ? body.onEmpty : before.onEmpty,
    keepDays: typeof body.keepDays === "number" && (AI_USAGE_KEEP_CHOICES as readonly number[]).includes(body.keepDays) ? body.keepDays : before.keepDays,
  };
  // A bigger budget can earn a fresh alert this month.
  const reset = data.budgetCents !== before.budgetCents ? { sent75: false, sent90: false } : {};
  const row = await prisma.aiUsageSettings.upsert({ where: { id: "global" }, create: { id: "global", ...data }, update: { ...data, ...reset } });
  res.json({ budgetCents: row.budgetCents, alert75: row.alert75, alert90: row.alert90, onEmpty: row.onEmpty, keepDays: row.keepDays });
});

export default router;
