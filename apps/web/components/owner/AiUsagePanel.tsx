"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AI_PRICES, AI_SEARCH_PRICE, AI_USAGE_KEEP_CHOICES } from "@spartacus/shared";
import { NeonCard } from "../ui/NeonCard";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { api, type AiUsageEntry, type AiUsageLogRow, type AiUsageSettingsRow, type AiUsageSummary } from "../../lib/api";

// Command Center › AI Usage (owner only): what AI Chat and AI Moderation cost
// across every server, against a monthly budget, plus the log of every question.

const SERIES = { answers: "#338ced", searches: "#e76624", mod: "#00a888" };
const STATUS = { good: "#0aac23", warn: "#fbb315", crit: "#dc3c3d" };
const MODEL_NAME: Record<string, string> = { "claude-sonnet-5-5": "Smarter", "claude-haiku-5-5": "Fast" };

const usd = (micros: number) => `$${(micros / 1e6).toFixed(2)}`;
function money(micros: number) {
  const d = micros / 1e6;
  if (d > 0 && d < 0.001) return "<0.1¢";
  if (d < 1) return `${(d * 100).toFixed(d < 0.1 ? 1 : 0)}¢`;
  return `$${d.toFixed(2)}`;
}
const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const label = "text-xs uppercase tracking-wide text-slate-500";
const segBtn = (on: boolean) =>
  `rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${on ? "border-neon-blue bg-neon-blue/15 text-slate-100" : "border-white/10 text-slate-400 hover:text-slate-200"}`;

type Period = "today" | "7" | "month";
type Filter = "all" | "search" | "fail" | "mod";

export function AiUsagePanel() {
  const [period, setPeriod] = useState<Period>("month");
  const [guildId, setGuildId] = useState("");
  const [data, setData] = useState<AiUsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AiUsageSettingsRow | null>(null);
  const [budgetText, setBudgetText] = useState("");

  const load = useCallback(() => {
    api
      .getAiUsage(period, guildId)
      .then((d) => {
        setData(d);
        setSettings(d.settings);
        setBudgetText(String(d.settings.budgetCents / 100));
        setError(null);
      })
      .catch((e: Error) => setError(e.message || "Couldn't load AI usage."));
  }, [period, guildId]);
  useEffect(load, [load]);

  async function save(next: Partial<AiUsageSettingsRow>) {
    if (!settings) return;
    setSettings({ ...settings, ...next });
    const saved = await api.setAiUsageSettings(next).catch(() => null);
    if (saved) setSettings(saved);
  }

  if (error) return <p className="text-sm text-rose-400">{error}</p>;
  if (!data || !settings) return <p className="text-sm text-slate-500">Loading AI usage…</p>;

  const t = data.totals;
  const budgetMicros = settings.budgetCents * 10_000;
  const pct = budgetMicros > 0 ? data.monthSpentMicros / budgetMicros : 0;
  const pace = (data.monthSpentMicros / Math.max(1, data.dayOfMonth)) * data.daysInMonth;
  const status = pct >= 0.9 ? { c: STATUS.crit, text: "⛔ Almost out", cls: "text-rose-300 border-rose-500/40 bg-rose-500/10" } : pct >= 0.75 ? { c: STATUS.warn, text: "⚠ Getting close", cls: "text-amber-300 border-amber-500/40 bg-amber-500/10" } : { c: STATUS.good, text: "✓ On track", cls: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10" };
  const word = period === "today" ? "today" : period === "7" ? "last 7 days" : "this month";
  const answered = t.asked - t.failed;
  const monthName = new Date(`${data.month}-15T12:00:00`).toLocaleDateString("en-US", { month: "long" });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-400 max-w-xl">
          What AI Chat and AI Moderation cost on every server, worked out from Anthropic&apos;s prices. Only you can see this.
        </p>
        <div className="flex flex-wrap gap-2">
          <select
            value={guildId}
            onChange={(e) => setGuildId(e.target.value)}
            className="bg-base-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm"
            aria-label="Server"
          >
            <option value="">All servers</option>
            {data.byServer.map((s) => (
              <option key={s.guildId} value={s.guildId}>
                {s.name}
              </option>
            ))}
          </select>
          {(
            [
              ["today", "Today"],
              ["7", "7 days"],
              ["month", "This month"],
            ] as const
          ).map(([k, n]) => (
            <button key={k} type="button" onClick={() => setPeriod(k)} aria-pressed={period === k} className={segBtn(period === k)}>
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Budget */}
      <NeonCard>
        <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-4 items-center">
          <Gauge pct={pct} color={status.c} marks={[settings.alert75 ? 0.75 : null, settings.alert90 ? 0.9 : null]} />
          <div className="space-y-2">
            <p>
              <span className="text-3xl font-bold">{usd(data.monthSpentMicros)}</span>{" "}
              <span className="text-slate-400">of {usd(budgetMicros)} used in {monthName}</span>
            </p>
            <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-bold ${status.cls}`}>{status.text}</span>
            <p className="text-xs text-slate-400">
              At this pace: about <b className="text-slate-200">{usd(pace)}</b> by the end of {monthName}. {usd(Math.max(0, budgetMicros - data.monthSpentMicros))} left.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="ai-budget" className="text-xs text-slate-400">
                Monthly budget $
              </label>
              <input
                id="ai-budget"
                type="number"
                min={1}
                step={1}
                value={budgetText}
                onChange={(e) => setBudgetText(e.target.value)}
                onBlur={() => {
                  const n = Math.max(1, Math.round(Number(budgetText) || settings.budgetCents / 100));
                  setBudgetText(String(n));
                  if (n * 100 !== settings.budgetCents) void save({ budgetCents: n * 100 });
                }}
                className="w-24 bg-base-950 border border-white/10 rounded-lg px-2 py-1.5 text-sm"
              />
              {[5, 10, 25, 50].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setBudgetText(String(v));
                    void save({ budgetCents: v * 100 });
                  }}
                  aria-pressed={settings.budgetCents === v * 100}
                  className={segBtn(settings.budgetCents === v * 100)}
                >
                  ${v}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-white/5 mt-4 pt-4 space-y-3">
          <p className="font-medium">When it gets close</p>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <ToggleSwitch size="sm" enabled={settings.alert75} onChange={(v) => save({ alert75: v })} />
            Send me a Discord DM at 75%
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <ToggleSwitch size="sm" enabled={settings.alert90} onChange={(v) => save({ alert90: v })} />
            Send me a Discord DM at 90%
          </label>
          <p className="text-xs text-slate-500">When the budget runs out:</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["keep", "Keep going"],
                ["fast", "Switch to Fast & cheap"],
                ["pause", "Pause AI Chat"],
              ] as const
            ).map(([k, n]) => (
              <button key={k} type="button" onClick={() => save({ onEmpty: k })} aria-pressed={settings.onEmpty === k} className={segBtn(settings.onEmpty === k)}>
                {n}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            {settings.onEmpty === "keep"
              ? "It keeps answering and you're billed past the budget."
              : settings.onEmpty === "fast"
                ? "Every server's AI Chat uses the cheap model until the 1st, then goes back to normal."
                : "AI Chat stops answering on every server until the 1st and tells people why. AI Moderation keeps running."}{" "}
            Changes take up to a minute to reach the bot.
          </p>
        </div>
      </NeonCard>

      {/* Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile k="Spent" v={usd(t.spentMicros)} d={word} />
        <Tile k="Questions answered" v={answered.toLocaleString()} d={`${t.failed} skipped or failed`} />
        <Tile k="Web searches" v={t.searches.toLocaleString()} d={`${money(t.searchMicros)} in searches`} />
        <Tile k="Avg per answer" v={answered ? money(t.chatMicros / answered) : "—"} d={`${t.modChecks.toLocaleString()} messages moderated`} />
      </div>

      <CostChart chart={data.chart} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <NeonCard>
          <p className="font-medium mb-3">Where the money goes</p>
          <Bars
            rows={[
              ...data.byModel.map((m) => ({ name: `${MODEL_NAME[m.model] ?? m.model} answers`, v: m.costMicros, c: SERIES.answers })),
              { name: "Web searches", v: t.searchMicros, c: SERIES.searches },
              { name: "AI Moderation", v: t.modMicros, c: SERIES.mod },
            ]}
          />
          <p className="text-xs text-slate-500 mt-3">
            Answers include their web search cost. Searches are usually the biggest part; lower &quot;searches per question&quot; on a server&apos;s AI Chat page to spend less.
          </p>
        </NeonCard>
        <NeonCard>
          <p className="font-medium mb-3">Top askers</p>
          {data.topAskers.length ? (
            <Bars rows={data.topAskers.map((a) => ({ name: `${a.userName ?? "Unknown"} · ${a.count}`, v: a.costMicros, c: SERIES.answers }))} />
          ) : (
            <p className="text-sm text-slate-500">No questions {word}.</p>
          )}
          {!guildId && data.byServer.length > 1 && (
            <>
              <p className="font-medium mt-5 mb-3">By server</p>
              <Bars rows={data.byServer.map((s) => ({ name: s.name, v: s.costMicros, c: SERIES.answers }))} />
            </>
          )}
        </NeonCard>
      </div>

      <UsageLog period={period} guildId={guildId} />

      <NeonCard>
        <p className="font-medium mb-2">Log settings</p>
        <p className="text-xs text-slate-500 mb-2">Keep the message log for:</p>
        <div className="flex flex-wrap gap-2">
          {AI_USAGE_KEEP_CHOICES.map((d) => (
            <button key={d} type="button" onClick={() => save({ keepDays: d })} aria-pressed={settings.keepDays === d} className={segBtn(settings.keepDays === d)}>
              {d} days
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Older questions and answers are deleted for good. The totals, chart and budget keep counting. Costs here are worked out from Anthropic&apos;s list prices, so they can
          differ a little from your real bill at platform.claude.com.
        </p>
      </NeonCard>
    </div>
  );
}

function Tile({ k, v, d }: { k: string; v: string; d: string }) {
  return (
    <NeonCard>
      <p className={label}>{k}</p>
      <p className="text-2xl font-bold mt-1">{v}</p>
      <p className="text-xs text-slate-500">{d}</p>
    </NeonCard>
  );
}

function Gauge({ pct, color, marks }: { pct: number; color: string; marks: Array<number | null> }) {
  const R = 90,
    cx = 110,
    cy = 105;
  const pt = (f: number, r = R) => [cx - r * Math.cos(Math.PI * f), cy - r * Math.sin(Math.PI * f)];
  const a = Math.min(1, Math.max(0, pct));
  const [x1, y1] = pt(0),
    [x2, y2] = pt(1),
    [xv, yv] = pt(a);
  return (
    <svg viewBox="0 0 220 125" className="w-[220px] max-w-full mx-auto" role="img" aria-label={`${Math.round(pct * 100)}% of the monthly budget used`}>
      <path d={`M${x1} ${y1} A${R} ${R} 0 0 1 ${x2} ${y2}`} fill="none" stroke="#24304b" strokeWidth={16} strokeLinecap="round" />
      {a > 0 && <path d={`M${x1} ${y1} A${R} ${R} 0 0 1 ${xv} ${yv}`} fill="none" stroke={color} strokeWidth={16} strokeLinecap="round" />}
      {marks.map((m) => {
        if (m === null) return null;
        const [o1, p1] = pt(m, R + 10),
          [o2, p2] = pt(m, R - 10);
        return <line key={m} x1={o1} y1={p1} x2={o2} y2={p2} stroke="#8a96b2" strokeWidth={2} />;
      })}
      <text x={110} y={92} textAnchor="middle" fill="currentColor" fontSize={30} fontWeight={700}>
        {Math.round(pct * 100)}%
      </text>
      <text x={110} y={114} textAnchor="middle" fill="#8a96b2" fontSize={12}>
        of this month&apos;s budget
      </text>
    </svg>
  );
}

function Bars({ rows }: { rows: Array<{ name: string; v: number; c: string }> }) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.name} className="grid grid-cols-[minmax(0,9rem)_1fr_4rem] gap-3 items-center text-sm">
          <span className="truncate">{r.name}</span>
          <div className="h-2.5 rounded-r" style={{ width: `${Math.max(1, (r.v / max) * 100)}%`, background: r.c }} />
          <span className="text-right tabular-nums text-slate-400">{usd(r.v)}</span>
        </div>
      ))}
    </div>
  );
}

function niceMax(v: number) {
  for (const s of [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 25, 50]) if (s * 4 >= v) return s * 4;
  return Math.ceil(v);
}

function CostChart({ chart }: { chart: AiUsageSummary["chart"] }) {
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const totals = chart.map((d) => (d.answerMicros + d.searchMicros + d.modMicros) / 1e6);
  const max = niceMax(Math.max(0.01, ...totals));
  const H = 200;
  const every = chart.length > 20 ? 5 : chart.length > 10 ? 2 : 1;
  const h = hover !== null ? chart[hover] : null;

  return (
    <NeonCard>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="font-medium">Cost per day</p>
        <button type="button" onClick={() => setTable((v) => !v)} className="text-xs font-semibold text-neon-blue hover:underline">
          {table ? "Show chart" : "Show as table"}
        </button>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-slate-400 mb-3">
        {(
          [
            ["AI Chat answers", SERIES.answers],
            ["Web searches", SERIES.searches],
            ["AI Moderation", SERIES.mod],
          ] as const
        ).map(([n, c]) => (
          <span key={n} className="inline-flex items-center gap-1.5">
            <i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: c }} />
            {n}
          </span>
        ))}
      </div>

      {table ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500 text-left">
                <th className="py-1.5 pr-3">Day</th>
                <th className="py-1.5 pr-3 text-right">Questions</th>
                <th className="py-1.5 pr-3 text-right">Answers</th>
                <th className="py-1.5 pr-3 text-right">Searches</th>
                <th className="py-1.5 pr-3 text-right">Moderation</th>
                <th className="py-1.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {chart.map((d) => (
                <tr key={d.day}>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{dayLabel(d.day)}</td>
                  <td className="py-1.5 pr-3 text-right">{d.asked}</td>
                  <td className="py-1.5 pr-3 text-right">{usd(d.answerMicros)}</td>
                  <td className="py-1.5 pr-3 text-right">{usd(d.searchMicros)}</td>
                  <td className="py-1.5 pr-3 text-right">{usd(d.modMicros)}</td>
                  <td className="py-1.5 text-right font-semibold">{usd(d.answerMicros + d.searchMicros + d.modMicros)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="relative ml-12" style={{ height: H }} onMouseLeave={() => setHover(null)}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={`absolute left-0 right-0 border-t ${i === 0 ? "border-white/20" : "border-white/[0.06]"}`} style={{ bottom: `${i * 25}%` }}>
                <span className="absolute right-[calc(100%+6px)] -top-2 text-[11px] text-slate-500 tabular-nums whitespace-nowrap">${((max * i) / 4).toFixed(2)}</span>
              </div>
            ))}
            <div className="absolute inset-0 flex items-end gap-[3px]">
              {chart.map((d, i) => {
                const segs = [
                  [SERIES.answers, d.answerMicros],
                  [SERIES.searches, d.searchMicros],
                  [SERIES.mod, d.modMicros],
                ].filter(([, v]) => (v as number) > 0) as Array<[string, number]>;
                return (
                  <button
                    key={d.day}
                    type="button"
                    onMouseEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    onClick={() => setHover(i)}
                    aria-label={`${dayLabel(d.day)}: ${usd(d.answerMicros + d.searchMicros + d.modMicros)}`}
                    className={`relative flex-1 min-w-0 h-full flex flex-col-reverse gap-[2px] rounded ${hover === i ? "bg-white/[0.05]" : ""}`}
                  >
                    {segs.map(([c, v], k) => (
                      <span
                        key={c}
                        className={`block w-full shrink-0 ${k === segs.length - 1 ? "rounded-t" : ""}`}
                        style={{ height: Math.max(1, (v / 1e6 / max) * H - 2), background: c }}
                      />
                    ))}
                  </button>
                );
              })}
            </div>
            {h && (
              <div
                className="absolute z-10 -top-2 rounded-lg border border-white/15 bg-base-950 px-3 py-2 text-xs shadow-xl pointer-events-none min-w-[160px] tabular-nums"
                style={{ left: `clamp(0px, calc(${((hover! + 0.5) / chart.length) * 100}% - 80px), calc(100% - 160px))` }}
              >
                <p className="font-semibold mb-1">{dayLabel(h.day)}</p>
                <Row c={SERIES.answers} n={`Answers (${h.asked})`} v={usd(h.answerMicros)} />
                <Row c={SERIES.searches} n="Searches" v={usd(h.searchMicros)} />
                <Row c={SERIES.mod} n="Moderation" v={usd(h.modMicros)} />
                <div className="flex justify-between border-t border-white/10 mt-1 pt-1 font-semibold">
                  <span>Total</span>
                  <span>{usd(h.answerMicros + h.searchMicros + h.modMicros)}</span>
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-[3px] ml-12 mt-1 text-[10.5px] text-slate-500">
            {chart.map((d, i) => (
              <span key={d.day} className="flex-1 min-w-0 text-center overflow-hidden">
                {i % every === 0 || i === chart.length - 1 ? Number(d.day.slice(8)) : ""}
              </span>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2">Tap or hover a bar to see that day.</p>
        </>
      )}
    </NeonCard>
  );
}

function Row({ c, n, v }: { c: string; n: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="inline-flex items-center gap-1.5">
        <i className="inline-block w-2 h-2 rounded-sm" style={{ background: c }} />
        {n}
      </span>
      <span>{v}</span>
    </div>
  );
}

function UsageLog({ period, guildId }: { period: Period; guildId: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<AiUsageLogRow[] | null>(null);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  // Wait for typing to stop before searching.
  useEffect(() => {
    const t = setTimeout(() => setQuery(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setRows(null);
    api
      .getAiUsageLog({ period, filter, q: query, guildId })
      .then((r) => {
        setRows(r.rows);
        setMore(r.more);
      })
      .catch(() => setRows([]));
  }, [period, filter, query, guildId]);

  async function loadMore() {
    const last = rows?.[rows.length - 1];
    if (!last || last.kind !== "chat") return;
    const r = await api.getAiUsageLog({ period, filter, q: query, guildId, before: last.createdAt }).catch(() => null);
    if (r) {
      setRows((old) => [...(old ?? []), ...r.rows]);
      setMore(r.more);
    }
  }

  const today = new Date().toDateString();
  const when = (iso: string) => {
    const d = new Date(iso);
    return d.toDateString() === today ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <NeonCard>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <p className="font-medium">Message log</p>
        <span className="text-xs text-slate-500">Every AI Chat question, and AI Moderation per day</span>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search questions, answers or names…"
          aria-label="Search the log"
          disabled={filter === "mod"}
          className="flex-1 min-w-[180px] bg-base-950 border border-white/10 rounded-lg px-3 py-1.5 text-sm disabled:opacity-40"
        />
        {(
          [
            ["all", "Questions"],
            ["search", "Searched the web"],
            ["fail", "Skipped or failed"],
            ["mod", "Moderation"],
          ] as const
        ).map(([k, n]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k} className={segBtn(filter === k)}>
            {n}
          </button>
        ))}
      </div>

      {!rows ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing here yet. New AI questions show up as soon as they&apos;re asked.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) =>
            r.kind === "mod" ? (
              <div key={r.id} className="rounded-lg border border-white/5 bg-base-950/50 px-3 py-2 text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-16 shrink-0">{dayLabel(r.day).replace(/^\w+, /, "")}</span>
                  <span className="flex-1 min-w-0 truncate">
                    🛡️ {r.checks.toLocaleString()} messages checked · {r.flagged} flagged
                  </span>
                  <span className="font-semibold tabular-nums">{money(r.costMicros)}</span>
                </div>
                <p className="text-xs text-slate-500 ml-[4.75rem]">{r.guildName}</p>
              </div>
            ) : (
              <button
                key={r.id}
                type="button"
                onClick={() => setOpen(r.id)}
                className="w-full text-left rounded-lg border border-white/5 bg-base-950/50 hover:border-white/15 px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-16 shrink-0">{when(r.createdAt)}</span>
                  <span className="flex-1 min-w-0 truncate">{r.question}</span>
                  <span className="font-semibold tabular-nums">{r.costMicros ? money(r.costMicros) : "—"}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 ml-[4.75rem] mt-0.5">
                  <b className="text-slate-300 font-semibold">{r.userName}</b>· {r.channelName} · {r.guildName}
                  {r.model && <span className="rounded border border-sky-500/30 px-1.5 text-sky-300 font-semibold">{MODEL_NAME[r.model] ?? r.model}</span>}
                  {r.searches > 0 && (
                    <span className="rounded border border-orange-500/30 px-1.5 text-orange-300 font-semibold">
                      🔎 {r.searches} search{r.searches > 1 ? "es" : ""}
                    </span>
                  )}
                  {r.fail && <span className="rounded border border-rose-500/30 px-1.5 text-rose-300 font-semibold">✕ {r.fail}</span>}
                </div>
              </button>
            )
          )}
          {more && (
            <button type="button" onClick={loadMore} className="w-full rounded-lg border border-white/10 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5">
              Load more
            </button>
          )}
        </div>
      )}

      {open && <EntryDialog id={open} onClose={() => setOpen(null)} />}
    </NeonCard>
  );
}

function EntryDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [e, setE] = useState<AiUsageEntry | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api
      .getAiUsageEntry(id)
      .then(setE)
      .catch((x: Error) => setErr(x.message));
  }, [id]);
  useEffect(() => {
    const k = (ev: KeyboardEvent) => ev.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const cost = useMemo(() => {
    if (!e) return null;
    const p = AI_PRICES[e.model] ?? AI_PRICES["claude-sonnet-5-5"];
    return { p, read: e.inputTokens * p.in, write: e.outputTokens * p.out, search: e.searches * AI_SEARCH_PRICE * 1e6 };
  }, [e]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-4" onClick={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div role="dialog" aria-label="Message details" className="w-full max-w-xl max-h-[90vh] overflow-auto rounded-2xl border border-white/10 bg-base-900 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <p className="flex-1 font-semibold">💬 {e?.userName ?? "Message"}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg text-slate-400 hover:bg-white/5">
            ✕
          </button>
        </div>
        {err && <p className="text-sm text-rose-400">{err}</p>}
        {!e && !err && <p className="text-sm text-slate-500">Loading…</p>}
        {e && cost && (
          <>
            <p className="text-xs text-slate-500">
              {new Date(e.createdAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {e.channelName} ·{" "}
              {e.guildName}
              {e.model ? ` · ${MODEL_NAME[e.model] ?? e.model}` : ""}
            </p>
            <div>
              <p className="text-xs text-slate-500 mb-1">Question</p>
              <p className="rounded-lg bg-base-950 px-3 py-2 text-sm whitespace-pre-wrap">{e.question}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Answer</p>
              <p className="rounded-lg bg-base-950 px-3 py-2 text-sm whitespace-pre-wrap">
                {e.fail ? <span className="text-rose-300">Not answered: {e.fail}</span> : e.answer}
              </p>
            </div>
            {!!e.sources?.length && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Sources it used</p>
                <ul className="rounded-lg bg-base-950 px-3 py-2 text-sm space-y-1">
                  {e.sources.map((s) => (
                    <li key={s.url} className="truncate">
                      🔗{" "}
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-neon-blue hover:underline">
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {e.model && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Cost breakdown</p>
                <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm tabular-nums">
                  <span>
                    Words read ({e.inputTokens.toLocaleString()} tokens × ${cost.p.in}/million)
                  </span>
                  <span className="text-right">{money(cost.read)}</span>
                  <span>
                    Words written ({e.outputTokens.toLocaleString()} tokens × ${cost.p.out}/million)
                  </span>
                  <span className="text-right">{money(cost.write)}</span>
                  <span>Web searches ({e.searches} × 1¢)</span>
                  <span className="text-right">{money(cost.search)}</span>
                  <span className="font-semibold border-t border-white/10 pt-1">Total</span>
                  <span className="text-right font-semibold border-t border-white/10 pt-1">{money(e.costMicros)}</span>
                </div>
                {e.searches > 0 && <p className="text-xs text-slate-500 mt-2">Search results are long, which is why &quot;words read&quot; goes up a lot when it searches.</p>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
