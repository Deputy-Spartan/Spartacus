"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../../components/ui/NeonCard";
import { ToggleSwitch } from "../../../../../components/ui/ToggleSwitch";
import { api, type EconomyConfig, type ModuleState } from "../../../../../lib/api";
import { useBotAvatar } from "../../../../../lib/useBotAvatar";

export default function EconomySettingsPage({ params }: { params: { guildId: string } }) {
  const [config, setConfig] = useState<EconomyConfig | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const avatarUrl = useBotAvatar();

  useEffect(() => {
    api.getEconomyConfig(params.guildId).then(setConfig);
    api.getModules(params.guildId).then((state) => setEnabled((state as Record<string, ModuleState>).ECONOMY?.enabled ?? false));
  }, [params.guildId]);

  async function toggleEnabled(next: boolean) {
    setEnabled(next);
    await api.setModule(params.guildId, "ECONOMY", next).catch(() => setEnabled(!next));
  }

  async function persist(next: EconomyConfig) {
    setConfig(next);
    await api.setEconomyConfig(params.guildId, next);
  }

  if (!config) return <p className="text-slate-400">Loading…</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Economy Settings</h1>
      <p className="text-slate-400 mb-6">Master switch and currency identity. Earning rules, leaderboard and analytics each live on their own sidebar page.</p>

      <NeonCard className="max-w-2xl mb-4">
        <p className="font-medium mb-1">Master switch</p>
        <p className="text-xs text-slate-500 mb-4">Turn the economy on or off for this server.</p>
        <div className="flex items-center justify-between py-2.5">
          <div>
            <p className="text-sm font-medium">Enable Economy</p>
            <p className="text-xs text-slate-500">When off, message earnings and economy commands all reply that the economy is disabled.</p>
          </div>
          <ToggleSwitch enabled={enabled ?? false} onChange={toggleEnabled} label="Enable Economy" disabled={enabled === null} />
        </div>
      </NeonCard>

      <NeonCard className="max-w-2xl mb-4">
        <p className="font-medium mb-1">Currency identity</p>
        <p className="text-xs text-slate-500 mb-4">What members see in commands, embeds and the leaderboard.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-1">Currency name</label>
            <p className="text-xs text-slate-600 mb-2">Plural noun, e.g. coins / gems / credits.</p>
            <input
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
              value={config.currencyName}
              onChange={(e) => persist({ ...config, currencyName: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-1">Currency symbol</label>
            <p className="text-xs text-slate-600 mb-2">A unicode emoji or a Discord custom emoji.</p>
            <input
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
              value={config.currencyIcon}
              onChange={(e) => persist({ ...config, currencyIcon: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-1">Embed accent colour</label>
            <p className="text-xs text-slate-600 mb-2">Used by /balance, /daily, /pay and admin replies.</p>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-9 w-12 rounded-lg border border-white/10 bg-base-950 cursor-pointer"
                value={config.embedColor}
                onChange={(e) => persist({ ...config, embedColor: e.target.value })}
              />
              <input
                className="flex-1 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm font-mono"
                value={config.embedColor}
                onChange={(e) => persist({ ...config, embedColor: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-1">Maximum balance</label>
            <p className="text-xs text-slate-600 mb-2">The most a single member can hold. Earnings stop counting once they hit this number.</p>
            <input
              type="number"
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
              value={config.maxBalance}
              onChange={(e) => persist({ ...config, maxBalance: Number(e.target.value) })}
            />
          </div>
        </div>
      </NeonCard>

      <NeonCard className="max-w-2xl">
        <p className="font-medium mb-3">Embed preview</p>
        <p className="text-xs text-slate-500 mb-4">What /balance looks like with these settings.</p>
        <div className="rounded-lg bg-[#313338] p-4 font-sans">
          <div className="flex gap-3">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="h-10 w-10 shrink-0 rounded-full bg-neon-gradient" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-[#f2f3f5] font-medium text-sm">Spartacus</span>
                <span className="bg-[#5865f2] text-white text-[10px] px-1 rounded">APP</span>
                <span className="text-[#949ba4] text-xs">Today</span>
              </div>
              <div className="rounded bg-[#2b2d31] border-l-4 p-3 max-w-md" style={{ borderColor: config.embedColor }}>
                <p className="text-[#949ba4] text-xs uppercase mb-0.5">Wallet</p>
                <p className="text-[#f2f3f5] font-bold text-lg mb-1">
                  12,450 {config.currencyIcon} {config.currencyName}
                </p>
                <p className="text-[#949ba4] text-xs">Earned 38,210 · Spent 25,760 · Rank #7</p>
              </div>
            </div>
          </div>
        </div>
      </NeonCard>
    </div>
  );
}
