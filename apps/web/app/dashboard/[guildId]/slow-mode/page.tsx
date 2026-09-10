"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { Required } from "../../../../components/ui/Required";
import { FormError } from "../../../../components/ui/FormError";
import { api, type SlowModeChannelRow } from "../../../../lib/api";

const PRESETS = [
  { label: "Off", seconds: 0 },
  { label: "5s", seconds: 5 },
  { label: "10s", seconds: 10 },
  { label: "30s", seconds: 30 },
  { label: "1m", seconds: 60 },
  { label: "5m", seconds: 300 },
  { label: "15m", seconds: 900 },
  { label: "1h", seconds: 3600 },
];

function formatDuration(seconds: number) {
  if (seconds === 0) return "Off";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

export default function SlowModePage({ params }: { params: { guildId: string } }) {
  const [channels, setChannels] = useState<SlowModeChannelRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [customUnit, setCustomUnit] = useState<"s" | "m" | "h">("s");
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.getSlowModeChannels(params.guildId).then(setChannels);
  }
  useEffect(refresh, [params.guildId]);

  const selected = channels.find((c) => c.id === selectedId) ?? null;
  const active = channels.filter((c) => c.rateLimitPerUser > 0);

  async function applyTo(channelId: string, seconds: number) {
    setSaving(true);
    const updated = await api.setSlowMode(params.guildId, channelId, seconds);
    setChannels((prev) => prev.map((c) => (c.id === channelId ? { ...c, rateLimitPerUser: updated.rateLimitPerUser } : c)));
    setSaving(false);
  }

  async function apply(seconds: number) {
    if (!selectedId) return;
    await applyTo(selectedId, seconds);
  }

  async function applyCustom() {
    const amount = Number(customValue);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a positive number for the custom delay.");
      return;
    }
    setError(null);
    const multiplier = customUnit === "s" ? 1 : customUnit === "m" ? 60 : 3600;
    await apply(Math.min(21600, Math.round(amount * multiplier)));
    setShowCustom(false);
    setCustomValue("");
  }

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="SLOW_MODE"
        title="Slow Mode"
        description="Set how often members can send messages in a channel — applied directly to Discord, same as setting it in the channel settings."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <NeonCard>
          <p className="font-medium mb-3">Set Slow Mode</p>

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Channel</label>
          <ChannelSelect guildId={params.guildId} value={selectedId} onChange={setSelectedId} />

          {selected && (
            <>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">Delay</p>
                <span className="text-xs text-slate-400">Currently: {formatDuration(selected.rateLimitPerUser)}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => apply(p.seconds)}
                    disabled={saving}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-colors disabled:opacity-50 ${
                      selected.rateLimitPerUser === p.seconds
                        ? "bg-base-800 border-neon-blue/40 text-neon-blue"
                        : "bg-base-950 border-white/10 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  onClick={() => { setError(null); setShowCustom((v) => !v); }}
                  disabled={saving}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-colors disabled:opacity-50 ${
                    showCustom ? "bg-base-800 border-neon-blue/40 text-neon-blue" : "bg-base-950 border-white/10 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Custom…
                </button>
              </div>

              {showCustom && (
                <div className="flex items-center gap-2 mt-3">
                  <input
                    type="number"
                    min={1}
                    className="w-24 bg-base-950 border border-white/10 rounded-lg p-2 text-sm"
                    placeholder="Amount"
                    value={customValue}
                    onChange={(e) => setCustomValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && applyCustom()}
                  />
                  <select
                    className="bg-base-950 border border-white/10 rounded-lg p-2 text-sm"
                    value={customUnit}
                    onChange={(e) => setCustomUnit(e.target.value as "s" | "m" | "h")}
                  >
                    <option value="s">seconds</option>
                    <option value="m">minutes</option>
                    <option value="h">hours</option>
                  </select>
                  <button onClick={applyCustom} disabled={!customValue} className="neon-button-sm disabled:opacity-50">
                    Set
                  </button>
                  <FormError message={error} />
                </div>
              )}
            </>
          )}
          {!selected && <p className="text-sm text-slate-500">Pick a channel above to set its slow mode.</p>}
        </NeonCard>

        <NeonCard>
          <p className="font-medium mb-3">Active Slow Mode Channels</p>
          {active.length === 0 ? (
            <p className="text-sm text-slate-500">No channels currently have slow mode enabled.</p>
          ) : (
            <div className="divide-y divide-white/5">
              {active.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span>#{c.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-neon-blue font-medium">{formatDuration(c.rateLimitPerUser)}</span>
                    <button onClick={() => applyTo(c.id, 0)} className="text-slate-500 hover:text-rose-400 text-xs">
                      Turn off
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </NeonCard>
      </div>
    </div>
  );
}
