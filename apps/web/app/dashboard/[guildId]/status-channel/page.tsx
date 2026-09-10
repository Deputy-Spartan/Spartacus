"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { Required } from "../../../../components/ui/Required";
import { FormError } from "../../../../components/ui/FormError";
import { useBotStatus } from "../../../../lib/useBotStatus";
import { api, type StatusChannelRow } from "../../../../lib/api";

export default function StatusChannelPage({ params }: { params: { guildId: string } }) {
  const confirm = useConfirm();
  const status = useBotStatus();
  const [rows, setRows] = useState<StatusChannelRow[]>([]);
  const [channelNames, setChannelNames] = useState<Record<string, string>>({});
  const [channelId, setChannelId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.getStatusChannels(params.guildId).then(setRows);
  }
  useEffect(refresh, [params.guildId]);
  useEffect(() => {
    api.getDiscordChannels(params.guildId).then((c) => {
      const map: Record<string, string> = {};
      for (const ch of [...c.textChannels, ...c.voiceChannels]) map[ch.id] = ch.name;
      setChannelNames(map);
    });
  }, [params.guildId]);

  async function add() {
    if (!channelId) {
      setError("Select a channel before adding.");
      return;
    }
    setError(null);
    await api.addStatusChannel(params.guildId, channelId);
    setChannelId(null);
    refresh();
  }

  async function remove(id: string) {
    if (!(await confirm("Remove this status channel? The posted status message in Discord won't be deleted."))) return;
    await api.deleteStatusChannel(params.guildId, id);
    refresh();
  }

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="STATUS_CHANNEL"
        title="Status Channel"
        description="Posts a live embed to a channel of your choosing showing whether Spartacus is online, refreshed every minute."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <NeonCard>
          <p className="font-medium mb-3">Active Status Channels</p>
          {rows.length === 0 && <p className="text-sm text-slate-500">None yet.</p>}
          <div className="divide-y divide-white/5">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2.5 text-sm gap-3">
                <span className="text-slate-300 truncate">#{channelNames[r.channelId] ?? r.channelId}</span>
                <button onClick={() => remove(r.id)} className="text-slate-500 hover:text-rose-400 text-xs shrink-0">
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/5">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                status === null ? "bg-slate-600 animate-pulse" : status.online ? "bg-emerald-400" : "bg-slate-500"
              }`}
            />
            <span className="text-xs text-slate-500">
              Current preview: Spartacus is {status === null ? "checking…" : status.online ? "online" : "offline"}
            </span>
          </div>
        </NeonCard>

        <NeonCard>
          <p className="font-medium mb-3">New Status Channel</p>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
            Channel
            <Required />
          </label>
          <ChannelSelect guildId={params.guildId} value={channelId} onChange={setChannelId} kind="text" placeholder="Select a text channel…" />

          <button onClick={add} disabled={!channelId} className="neon-button mt-4 disabled:opacity-50">
            Add Status Channel
          </button>
          <FormError message={error} />
        </NeonCard>
      </div>
    </div>
  );
}
