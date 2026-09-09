"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../../components/ui/NeonCard";
import { api, type EconomyAnalytics, type EconomyConfig } from "../../../../../lib/api";
import { useMemberNames } from "../../../../../lib/useMemberNames";

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <NeonCard className="!p-4">
      <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-neon-blue">{value}</p>
    </NeonCard>
  );
}

export default function EconomyAnalyticsPage({ params }: { params: { guildId: string } }) {
  const [config, setConfig] = useState<EconomyConfig | null>(null);
  const [days, setDays] = useState(30);
  const [data, setData] = useState<EconomyAnalytics | null>(null);

  useEffect(() => {
    api.getEconomyConfig(params.guildId).then(setConfig);
  }, [params.guildId]);

  useEffect(() => {
    api.getEconomyAnalytics(params.guildId, days).then(setData);
  }, [params.guildId, days]);

  const icon = config?.currencyIcon ?? "";
  const { displayName } = useMemberNames(params.guildId, data?.topEarners.map((e) => e.userId) ?? []);

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-2 mb-1">
        <h1 className="text-2xl font-bold">Economy Analytics</h1>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                days === d ? "bg-base-800 border-neon-blue/40 text-neon-blue" : "bg-base-950 border-white/10 text-slate-400 hover:text-slate-200"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
      <p className="text-slate-400 mb-6">How much currency is out there, what came in vs. what went out, and who's holding most of it.</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard label="Total Held" value={`${(data?.totalHeld ?? 0).toLocaleString()} ${icon}`} />
        <StatCard label="Active Members" value={data?.activeMembers ?? 0} />
        <StatCard label={`Earned (${days}d)`} value={`${(data?.earned ?? 0).toLocaleString()} ${icon}`} />
        <StatCard label={`Removed (${days}d)`} value={`${(data?.removed ?? 0).toLocaleString()} ${icon}`} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        <NeonCard>
          <p className="font-medium mb-3">Concentration</p>
          <p className="text-xs text-slate-500 mb-3">How much of the total currency is held by the top members.</p>
          {(["top5", "top10", "top50"] as const).map((key) => (
            <div key={key} className="mb-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-400 uppercase">{key.replace("top", "Top ")}</span>
                <span>{(data?.concentration[key] ?? 0).toFixed(1)}%</span>
              </div>
              <div className="h-1.5 bg-base-800 rounded-full overflow-hidden">
                <div className="h-full bg-neon-blue" style={{ width: `${Math.min(100, data?.concentration[key] ?? 0)}%` }} />
              </div>
            </div>
          ))}
        </NeonCard>

        <NeonCard>
          <p className="font-medium mb-3">Top earners</p>
          <p className="text-xs text-slate-500 mb-3">By lifetime currency earned.</p>
          {!data || data.topEarners.length === 0 ? (
            <p className="text-sm text-slate-500">No earners yet.</p>
          ) : (
            <div className="space-y-2">
              {data.topEarners.map((e, i) => (
                <div key={e.userId} className="flex items-center justify-between text-sm">
                  <span>
                    {i + 1}. {displayName(e.userId)}
                  </span>
                  <span className="text-slate-400">
                    {e.totalEarned.toLocaleString()} {icon}
                  </span>
                </div>
              ))}
            </div>
          )}
        </NeonCard>
      </div>
    </div>
  );
}
