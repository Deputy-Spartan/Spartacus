"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../../components/ui/NeonCard";
import { ToggleSwitch } from "../../../../../components/ui/ToggleSwitch";
import { ChannelSelect } from "../../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../../components/ui/RoleSelect";
import { Required } from "../../../../../components/ui/Required";
import { FormError } from "../../../../../components/ui/FormError";
import { api, type EconomyConfig, type EconomyMultiplier } from "../../../../../lib/api";

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">{label}</label>
      <input
        type="number"
        className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export default function EconomyEarningPage({ params }: { params: { guildId: string } }) {
  const [config, setConfig] = useState<EconomyConfig | null>(null);
  const [newChannelId, setNewChannelId] = useState<string | null>(null);
  const [newRoleId, setNewRoleId] = useState<string | null>(null);
  const [channelMultiplierError, setChannelMultiplierError] = useState<string | null>(null);
  const [roleMultiplierError, setRoleMultiplierError] = useState<string | null>(null);

  useEffect(() => {
    api.getEconomyConfig(params.guildId).then(setConfig);
  }, [params.guildId]);

  async function persist(next: EconomyConfig) {
    setConfig(next);
    await api.setEconomyConfig(params.guildId, next);
  }

  if (!config) return <p className="text-slate-400">Loading…</p>;

  function addChannelMultiplier() {
    if (!config || !newChannelId) {
      setChannelMultiplierError("Select a channel before adding a multiplier.");
      return;
    }
    setChannelMultiplierError(null);
    const next: EconomyMultiplier[] = [...config.channelMultipliers.filter((m) => m.channelId !== newChannelId), { channelId: newChannelId, multiplier: 2 }];
    persist({ ...config, channelMultipliers: next });
    setNewChannelId(null);
  }

  function addRoleMultiplier() {
    if (!config || !newRoleId) {
      setRoleMultiplierError("Select a role before adding a multiplier.");
      return;
    }
    setRoleMultiplierError(null);
    const next: EconomyMultiplier[] = [...config.roleMultipliers.filter((m) => m.roleId !== newRoleId), { roleId: newRoleId, multiplier: 2 }];
    persist({ ...config, roleMultipliers: next });
    setNewRoleId(null);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Economy Earning</h1>
      <p className="text-slate-400 mb-6">How members earn and move currency: message rates, the daily claim, transfers, and per-channel / per-role multipliers.</p>

      <NeonCard className="max-w-2xl mb-4">
        <p className="font-medium mb-1">Message earning</p>
        <p className="text-xs text-slate-500 mb-4">Members earn currency for chatting. Cooldown stops a single member from farming.</p>

        <div className="flex items-center justify-between py-2.5 border-b border-white/5 mb-4">
          <div>
            <p className="text-sm font-medium">Earn on messages</p>
            <p className="text-xs text-slate-500">When off, members only earn through /daily and admin actions.</p>
          </div>
          <ToggleSwitch enabled={config.earnOnMessages} onChange={(v) => persist({ ...config, earnOnMessages: v })} label="Earn on messages" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <NumberField label="Min per message" value={config.messageEarnMin} onChange={(v) => persist({ ...config, messageEarnMin: v })} />
          <NumberField label="Max per message" value={config.messageEarnMax} onChange={(v) => persist({ ...config, messageEarnMax: v })} />
          <NumberField label="Cooldown (sec)" value={config.messageCooldownSec} onChange={(v) => persist({ ...config, messageCooldownSec: v })} />
          <NumberField label="Min message length" value={config.minMessageLength} onChange={(v) => persist({ ...config, minMessageLength: v })} />
        </div>
        <p className="text-xs text-slate-600 mt-2">Per-message payout is uniform between min and max. Cooldowns are per-user — they don't stack across channels.</p>
      </NeonCard>

      <NeonCard className="max-w-2xl mb-4">
        <p className="font-medium mb-1">Daily claim</p>
        <p className="text-xs text-slate-500 mb-4">A bonus members can claim once a day.</p>

        <div className="flex items-center justify-between py-2.5 border-b border-white/5 mb-4">
          <div>
            <p className="text-sm font-medium">Enable /daily</p>
            <p className="text-xs text-slate-500">Members run /daily to claim. Streak resets if they skip a day.</p>
          </div>
          <ToggleSwitch enabled={config.dailyEnabled} onChange={(v) => persist({ ...config, dailyEnabled: v })} label="Enable daily" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <NumberField label="Base amount" value={config.dailyAmount} onChange={(v) => persist({ ...config, dailyAmount: v })} />
          <NumberField label="Streak bonus / day" value={config.streakBonusPerDay} onChange={(v) => persist({ ...config, streakBonusPerDay: v })} />
          <NumberField label="Streak cap (days)" value={config.streakCapDays} onChange={(v) => persist({ ...config, streakCapDays: v })} />
        </div>
        <p className="text-xs text-slate-600 mt-2">Streak resets if a member skips a day. Bonus tops out at the streak cap × bonus amount.</p>
      </NeonCard>

      <NeonCard className="max-w-2xl mb-4">
        <p className="font-medium mb-1">Transfers</p>
        <p className="text-xs text-slate-500 mb-4">Member-to-member transfers via /pay @user amount.</p>

        <div className="flex items-center justify-between py-2.5 border-b border-white/5 mb-4">
          <div>
            <p className="text-sm font-medium">Allow /pay between members</p>
            <p className="text-xs text-slate-500">When off, members can't transfer at all.</p>
          </div>
          <ToggleSwitch enabled={config.transfersEnabled} onChange={(v) => persist({ ...config, transfersEnabled: v })} label="Allow transfers" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Minimum amount" value={config.transferMinAmount} onChange={(v) => persist({ ...config, transferMinAmount: v })} />
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Tax %</label>
            <p className="text-xs text-slate-600 mb-2">A percentage of every transfer is removed from circulation. Set to 0 to disable.</p>
            <input
              type="number"
              min={0}
              max={100}
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
              value={config.transferTaxPercent}
              onChange={(e) => persist({ ...config, transferTaxPercent: Number(e.target.value) })}
            />
          </div>
        </div>
      </NeonCard>

      <NeonCard className="max-w-2xl">
        <p className="font-medium mb-1">Multipliers</p>
        <p className="text-xs text-slate-500 mb-4">Earn faster in the right channels, faster in the right roles.</p>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Channel multipliers</p>
          </div>
          <p className="text-xs text-slate-600 mb-2">Set 0× to disable earning in a channel. Multipliers stack with role multipliers.</p>
          <div className="space-y-1.5 mb-2">
            {config.channelMultipliers.map((m) => (
              <div key={m.channelId} className="flex items-center justify-between bg-base-950 border border-white/10 rounded-lg px-3 py-2 text-sm">
                <span>#{m.channelId?.slice(0, 8)}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step={0.1}
                    className="w-20 bg-base-900 border border-white/10 rounded p-1 text-xs text-right"
                    value={m.multiplier}
                    onChange={(e) =>
                      persist({
                        ...config,
                        channelMultipliers: config.channelMultipliers.map((x) => (x.channelId === m.channelId ? { ...x, multiplier: Number(e.target.value) } : x)),
                      })
                    }
                  />
                  <span className="text-xs text-slate-500">×</span>
                  <button
                    onClick={() => persist({ ...config, channelMultipliers: config.channelMultipliers.filter((x) => x.channelId !== m.channelId) })}
                    className="text-slate-500 hover:text-rose-400"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <ChannelSelect guildId={params.guildId} value={newChannelId} onChange={setNewChannelId} />
            </div>
            <button onClick={addChannelMultiplier} disabled={!newChannelId} className="neon-button-sm disabled:opacity-50 h-fit">
              + Add channel
            </button>
          </div>
          <FormError message={channelMultiplierError} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Role multipliers</p>
          </div>
          <p className="text-xs text-slate-600 mb-2">A member with multiple roles takes the highest multiplier — they don't stack.</p>
          <div className="space-y-1.5 mb-2">
            {config.roleMultipliers.map((m) => (
              <div key={m.roleId} className="flex items-center justify-between bg-base-950 border border-white/10 rounded-lg px-3 py-2 text-sm">
                <span>@{m.roleId?.slice(0, 8)}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step={0.1}
                    className="w-20 bg-base-900 border border-white/10 rounded p-1 text-xs text-right"
                    value={m.multiplier}
                    onChange={(e) =>
                      persist({
                        ...config,
                        roleMultipliers: config.roleMultipliers.map((x) => (x.roleId === m.roleId ? { ...x, multiplier: Number(e.target.value) } : x)),
                      })
                    }
                  />
                  <span className="text-xs text-slate-500">×</span>
                  <button
                    onClick={() => persist({ ...config, roleMultipliers: config.roleMultipliers.filter((x) => x.roleId !== m.roleId) })}
                    className="text-slate-500 hover:text-rose-400"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <RoleSelect guildId={params.guildId} value={newRoleId} onChange={setNewRoleId} />
            </div>
            <button onClick={addRoleMultiplier} disabled={!newRoleId} className="neon-button-sm disabled:opacity-50 h-fit">
              + Add role
            </button>
          </div>
          <FormError message={roleMultiplierError} />
        </div>
      </NeonCard>
    </div>
  );
}
