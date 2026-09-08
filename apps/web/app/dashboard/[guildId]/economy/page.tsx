"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { api, type EconomyConfig, type EconomyBalanceRow } from "../../../../lib/api";

export default function EconomyPage({ params }: { params: { guildId: string } }) {
  const [config, setConfig] = useState<EconomyConfig | null>(null);
  const [leaderboard, setLeaderboard] = useState<EconomyBalanceRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getEconomyConfig(params.guildId).then(setConfig);
    api.getEconomyLeaderboard(params.guildId).then(setLeaderboard);
  }, [params.guildId]);

  async function save() {
    if (!config) return;
    setSaving(true);
    setConfig(await api.setEconomyConfig(params.guildId, config));
    setSaving(false);
  }

  if (!config) return <p className="text-slate-400">Loading…</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Economy</h1>
      <p className="text-slate-400 mb-6">
        Members earn currency passively from messages and can claim a daily reward — wagered in Casino games.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NeonCard>
          <p className="font-medium mb-3">Settings</p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Currency Name</label>
              <input
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                value={config.currencyName}
                onChange={(e) => setConfig({ ...config, currencyName: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Icon</label>
              <input
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                value={config.currencyIcon}
                onChange={(e) => setConfig({ ...config, currencyIcon: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Msg Earn Min</label>
              <input
                type="number"
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                value={config.messageEarnMin}
                onChange={(e) => setConfig({ ...config, messageEarnMin: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Msg Earn Max</label>
              <input
                type="number"
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                value={config.messageEarnMax}
                onChange={(e) => setConfig({ ...config, messageEarnMax: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Daily Amount</label>
              <input
                type="number"
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                value={config.dailyAmount}
                onChange={(e) => setConfig({ ...config, dailyAmount: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Max Casino Bet</label>
              <input
                type="number"
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                value={config.maxBet}
                onChange={(e) => setConfig({ ...config, maxBet: Number(e.target.value) })}
              />
            </div>
          </div>
          <button onClick={save} disabled={saving} className="neon-button">
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </NeonCard>

        <NeonCard>
          <p className="font-medium mb-3">Richest Members</p>
          {leaderboard.length === 0 && <p className="text-sm text-slate-500">No balances yet.</p>}
          <div className="divide-y divide-white/5">
            {leaderboard.map((row, i) => (
              <div key={row.userId} className="flex items-center justify-between py-2.5 text-sm">
                <span>
                  #{i + 1} user {row.userId}
                </span>
                <span className="text-neon-blue font-medium">
                  {config.currencyIcon} {row.balance.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </NeonCard>
      </div>
    </div>
  );
}
