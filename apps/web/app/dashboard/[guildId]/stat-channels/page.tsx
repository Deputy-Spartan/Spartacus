"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { Required } from "../../../../components/ui/Required";
import { FormError } from "../../../../components/ui/FormError";
import { api, type StatChannelRow } from "../../../../lib/api";

const STAT_TYPES = [
  { value: "MEMBER_COUNT", label: "Member Count" },
  { value: "BOOST_COUNT", label: "Boost Count" },
  { value: "CHANNEL_COUNT", label: "Channel Count" },
];

export default function StatChannelsPage({ params }: { params: { guildId: string } }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<StatChannelRow[]>([]);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [statType, setStatType] = useState("MEMBER_COUNT");
  const [format, setFormat] = useState("{stat}: {count}");
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.getStatChannels(params.guildId).then(setRows);
  }
  useEffect(refresh, [params.guildId]);

  async function add() {
    if (!channelId) {
      setError("Select a voice channel before adding.");
      return;
    }
    setError(null);
    await api.addStatChannel(params.guildId, channelId, statType, format);
    setChannelId(null);
    refresh();
  }

  async function remove(id: string) {
    if (!(await confirm("Remove this stat channel? The Discord channel itself won't be deleted."))) return;
    await api.deleteStatChannel(params.guildId, id);
    refresh();
  }

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="STAT_CHANNELS"
        title="Server Stat Channels"
        description="Renames a voice channel to show a live count — Discord limits renames to about once every 5 minutes, so updates every 10 minutes."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <NeonCard>
          <p className="font-medium mb-3">Active Stat Channels</p>
          {rows.length === 0 && <p className="text-sm text-slate-500">None yet.</p>}
          <div className="divide-y divide-white/5">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2.5 text-sm gap-3">
                <div className="min-w-0">
                  <span className="text-slate-300 truncate block">#{r.channelId}</span>
                  <span className="text-slate-600 text-xs">
                    {STAT_TYPES.find((t) => t.value === r.statType)?.label} — "{r.format}"
                  </span>
                </div>
                <button onClick={() => remove(r.id)} className="text-slate-500 hover:text-rose-400 text-xs shrink-0">
                  Remove
                </button>
              </div>
            ))}
          </div>
        </NeonCard>

        <NeonCard>
          <p className="font-medium mb-3">New Stat Channel</p>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
            Channel
            <Required />
          </label>
          <ChannelSelect guildId={params.guildId} value={channelId} onChange={setChannelId} kind="voice" placeholder="Select a voice channel…" />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Stat Type</label>
          <select
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            value={statType}
            onChange={(e) => setStatType(e.target.value)}
          >
            {STAT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Name Format</label>
          <input
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-2"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          />
          <p className="text-xs text-slate-600 mb-4">
            Use <code className="text-neon-blue">{"{stat}"}</code> and <code className="text-neon-blue">{"{count}"}</code> as placeholders.
          </p>

          <button onClick={add} disabled={!channelId} className="neon-button disabled:opacity-50">
            Add Stat Channel
          </button>
          <FormError message={error} />
        </NeonCard>
      </div>
    </div>
  );
}
