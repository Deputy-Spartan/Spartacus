"use client";

import { useEffect, useState } from "react";
import { api, type GrowthSnapshotRow, type LeaderboardRow } from "../../lib/api";
import { NeonCard } from "./NeonCard";

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const weekday = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short" });
const avatarUrl = (r: LeaderboardRow) => (r.avatar ? `https://cdn.discordapp.com/avatars/${r.userId}/${r.avatar}.png?size=64` : `https://cdn.discordapp.com/embed/avatars/${Number(r.userId.slice(-2)) % 6}.png`);

// Member growth (line), messages per day (bars) and the most active members,
// from the daily growth snapshots and the XP leaderboard.
export function OverviewCharts({ guildId }: { guildId: string }) {
  const [snaps, setSnaps] = useState<GrowthSnapshotRow[] | null>(null);
  const [top, setTop] = useState<LeaderboardRow[]>([]);

  useEffect(() => {
    api.getGrowthSnapshots(guildId).then(setSnaps).catch(() => setSnaps([]));
    api
      .getLeaderboard(guildId)
      .then((rows) => setTop(rows.slice(0, 5)))
      .catch(() => null);
  }, [guildId]);

  if (!snaps) return null;
  const enough = snaps.length >= 2;
  const members = snaps.map((s) => s.memberCount);
  const week = snaps.slice(-7);
  const change = enough ? members[members.length - 1] - members[0] : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      <NeonCard>
        <div className="flex items-baseline justify-between mb-2">
          <p className="font-medium">Member growth</p>
          <p className="text-xs text-slate-500">{enough ? `Last ${snaps.length} days · ${change >= 0 ? "▲" : "▼"} ${Math.abs(change)}` : "Last 30 days"}</p>
        </div>
        {enough ? <LineChart values={members} labels={[day(snaps[0].createdAt), day(snaps[Math.floor(snaps.length / 2)].createdAt), day(snaps[snaps.length - 1].createdAt)]} /> : <Empty />}
      </NeonCard>

      <NeonCard>
        <div className="flex items-baseline justify-between mb-2">
          <p className="font-medium">Messages per day</p>
          <p className="text-xs text-slate-500">Last 7 days</p>
        </div>
        {enough ? <Bars values={week.map((s) => s.messageCount)} labels={week.map((s) => weekday(s.createdAt))} /> : <Empty />}
      </NeonCard>

      {top.length > 0 && (
        <NeonCard className="lg:col-span-2">
          <p className="font-medium mb-3">Most active members</p>
          <div className="grid gap-2">
            {top.map((r, i) => (
              <div key={r.userId} className="flex items-center gap-3 text-sm">
                <span className={`rank-badge rank-${i + 1} grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-extrabold`}>{i + 1}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={avatarUrl(r)} alt="" className="h-7 w-7 rounded-full shrink-0" loading="lazy" />
                <span className="flex-1 min-w-0 truncate">{r.nickname || r.username || "Former member"}</span>
                <span className="text-xs text-slate-500 whitespace-nowrap">
                  Level {r.level} · {r.xp.toLocaleString()} XP
                </span>
              </div>
            ))}
          </div>
        </NeonCard>
      )}
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-slate-500 py-8 text-center">This fills in after a couple of days. Spartacus records your server once a day.</p>;
}

function LineChart({ values, labels }: { values: number[]; labels: string[] }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const pad = Math.max(1, (max - min) * 0.15);
  const top = max + pad;
  const bottom = Math.max(0, min - pad);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 300, 110 - ((v - bottom) / (top - bottom || 1)) * 100]);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <div>
      <svg viewBox="0 0 300 120" preserveAspectRatio="none" className="w-full h-32" role="img" aria-label={`Members went from ${values[0]} to ${values[values.length - 1]}`}>
        {[30, 60, 90].map((y) => (
          <line key={y} x1="0" x2="300" y1={y} y2={y} className="chart-grid" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
        ))}
        <polygon points={`0,120 ${line} 300,120`} fill="rgba(123,153,188,0.18)" />
        <polyline points={line} fill="none" stroke="#7b99bc" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <circle cx={last[0]} cy={last[1]} r="3.5" fill="#7b99bc" />
      </svg>
      <div className="flex justify-between text-[11px] text-slate-500 mt-1">
        {labels.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
    </div>
  );
}

function Bars({ values, labels }: { values: number[]; labels: string[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="grid gap-2 h-36 items-end" style={{ gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` }}>
      {values.map((v, i) => (
        <div key={i} className="grid h-full items-end justify-items-center gap-1" style={{ gridTemplateRows: "auto 1fr auto" }} title={`${labels[i]}: ${v} messages`}>
          <span className="text-[11px] text-slate-500">{v}</span>
          <span className="block w-full max-w-[30px] self-end rounded-t-md bg-gradient-to-b from-[#7b99bc] to-[#5e7fa6]" style={{ height: `${Math.max(3, Math.round((v / max) * 100))}%` }} />
          <span className="text-[11px] text-slate-500">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}
