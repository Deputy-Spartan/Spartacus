"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { api, type LeaderboardRow } from "../../../../lib/api";
import { downloadCsv } from "../../../../lib/csv";

export default function LevelingPage({ params }: { params: { guildId: string } }) {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);

  useEffect(() => {
    api.getLeaderboard(params.guildId).then(setRows);
  }, [params.guildId]);

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="LEVELING"
        title="Leveling & XP"
        description="Top members by message-based XP this server has ever awarded."
      />

      {rows && rows.length > 0 && (
        <div className="flex justify-end mb-3">
          <button
            onClick={() =>
              downloadCsv(
                `leveling-leaderboard-${params.guildId}.csv`,
                rows.map((row) => ({
                  userId: row.userId,
                  username: row.username ?? "",
                  nickname: row.nickname ?? "",
                  xp: row.xp,
                  level: row.level,
                }))
              )
            }
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-base-900 border border-white/10 hover:border-neon-blue transition-colors"
          >
            Export CSV
          </button>
        </div>
      )}

      <NeonCard>
        {!rows && <p className="text-slate-500 text-sm">Loading…</p>}
        {rows?.length === 0 && <p className="text-slate-500 text-sm">No XP data yet — activity will appear here.</p>}
        <div className="divide-y divide-white/5">
          {rows?.map((row, i) => (
            <div key={row.userId} className="flex items-center gap-4 py-3">
              <span className="w-6 text-slate-500 font-semibold text-sm">#{i + 1}</span>
              <div className="w-9 h-9 rounded-full bg-base-800 border border-white/10 flex items-center justify-center text-xs text-slate-400">
                {(row.username ?? row.userId).slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {row.username ?? `User ${row.userId}`}
                  {row.nickname && row.nickname !== row.username && (
                    <span className="text-slate-500 font-normal"> ({row.nickname})</span>
                  )}
                </p>
                <div className="h-1.5 bg-base-800 rounded-full mt-1.5 overflow-hidden max-w-xs">
                  <div
                    className="h-full bg-neon-gradient rounded-full"
                    style={{ width: `${Math.min(100, (row.xp % 1000) / 10)}%` }}
                  />
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-neon-blue">LVL {row.level}</p>
                <p className="text-xs text-slate-500">{row.xp.toLocaleString()} XP</p>
              </div>
            </div>
          ))}
        </div>
      </NeonCard>
    </div>
  );
}
