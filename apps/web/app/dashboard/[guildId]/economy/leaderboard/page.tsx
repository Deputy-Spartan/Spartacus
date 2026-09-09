"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../../components/ui/NeonCard";
import { api, type EconomyBalanceRow, type EconomyConfig } from "../../../../../lib/api";
import { useMemberNames } from "../../../../../lib/useMemberNames";

export default function EconomyLeaderboardPage({ params }: { params: { guildId: string } }) {
  const [config, setConfig] = useState<EconomyConfig | null>(null);
  const [rows, setRows] = useState<EconomyBalanceRow[]>([]);
  const { displayName } = useMemberNames(params.guildId, rows.map((r) => r.userId));

  useEffect(() => {
    api.getEconomyConfig(params.guildId).then(setConfig);
    api.getEconomyLeaderboard(params.guildId).then(setRows);
  }, [params.guildId]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Economy Leaderboard</h1>
      <p className="text-slate-400 mb-6">Top wallets in this server, ranked by current balance.</p>

      <NeonCard className="max-w-2xl">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="font-medium">Top wallets</p>
            <p className="text-xs text-slate-500">Sorted by balance.</p>
          </div>
          {config && (
            <span className="text-xs text-slate-500">
              {config.currencyIcon} {config.currencyName}
            </span>
          )}
        </div>
        {rows.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm font-medium mb-1">No wallets with currency yet.</p>
            <p className="text-xs text-slate-500">Members start earning as soon as Economy is enabled and they post.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {rows.map((row, i) => (
              <div key={row.userId} className="flex items-center justify-between py-2.5 text-sm">
                <span>
                  #{i + 1} — {displayName(row.userId)}
                </span>
                <span className="text-neon-blue font-medium">
                  {config?.currencyIcon} {row.balance.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </NeonCard>
    </div>
  );
}
