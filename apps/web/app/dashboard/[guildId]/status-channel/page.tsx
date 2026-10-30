"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { Required } from "../../../../components/ui/Required";
import { FormError } from "../../../../components/ui/FormError";
import { api, type AlertSettingsRow, type StatusChannelRow } from "../../../../lib/api";

function ActiveChannelsCard({ guildId }: { guildId: string }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<StatusChannelRow[]>([]);
  const [channelNames, setChannelNames] = useState<Record<string, string>>({});

  function refresh() {
    api.getStatusChannels(guildId).then(setRows);
  }
  useEffect(refresh, [guildId]);
  useEffect(() => {
    api.getDiscordChannels(guildId).then((c) => {
      const map: Record<string, string> = {};
      for (const ch of [...c.textChannels, ...c.voiceChannels]) map[ch.id] = ch.name;
      setChannelNames(map);
    });
  }, [guildId]);

  async function remove(id: string) {
    if (!(await confirm("Remove this status channel? The posted status message in Discord won't be deleted."))) return;
    await api.deleteStatusChannel(guildId, id);
    refresh();
  }

  return (
    <NeonCard>
      <p className="font-medium mb-3">Active Status Channels</p>
      {rows.length === 0 && <p className="text-sm text-slate-500">None yet — add one on the right.</p>}
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
    </NeonCard>
  );
}

function AddChannelCard({ guildId, onAdded }: { guildId: string; onAdded: () => void }) {
  const [channelId, setChannelId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!channelId) {
      setError("Select a channel before adding.");
      return;
    }
    setError(null);
    await api.addStatusChannel(guildId, channelId);
    setChannelId(null);
    onAdded();
  }

  return (
    <NeonCard>
      <p className="font-medium mb-3">Add Status Channel</p>
      <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
        Channel
        <Required />
      </label>
      <ChannelSelect guildId={guildId} value={channelId} onChange={setChannelId} kind="text" placeholder="Select a text channel…" />

      <button onClick={add} disabled={!channelId} className="neon-button mt-4 disabled:opacity-50">
        Add Status Channel
      </button>
      <FormError message={error} />
    </NeonCard>
  );
}

function UptimeHistoryCard({ guildId }: { guildId: string }) {
  const [alertSettings, setAlertSettings] = useState<AlertSettingsRow | null>(null);

  useEffect(() => {
    api.getAlertSettings(guildId).then(setAlertSettings);
  }, [guildId]);

  async function update(newChannelId: string) {
    const value = newChannelId || null;
    setAlertSettings((prev) => (prev ? { ...prev, uptimeChannelId: value } : prev));
    await api.updateAlertSettings(guildId, { uptimeChannelId: value });
  }

  return (
    <NeonCard>
      <p className="font-medium mb-1">Uptime History Channel</p>
      <p className="text-xs text-slate-500 mb-3">
        A separate, running log — one message every time Spartacus goes offline or comes back, including how long it was down.
      </p>
      <ChannelSelect
        guildId={guildId}
        value={alertSettings?.uptimeChannelId ?? null}
        onChange={update}
        kind="text"
        placeholder="Off — not posting anywhere"
      />
    </NeonCard>
  );
}

function BotUpdatesChannelCard({ guildId }: { guildId: string }) {
  const [alertSettings, setAlertSettings] = useState<AlertSettingsRow | null>(null);

  useEffect(() => {
    api.getAlertSettings(guildId).then(setAlertSettings);
  }, [guildId]);

  async function update(newChannelId: string) {
    const value = newChannelId || null;
    setAlertSettings((prev) => (prev ? { ...prev, botUpdatesChannelId: value } : prev));
    await api.updateAlertSettings(guildId, { botUpdatesChannelId: value });
  }

  return (
    <NeonCard>
      <p className="font-medium mb-1">Bot Updates Channel</p>
      <p className="text-xs text-slate-500 mb-3">
        Mirrors every "What's New" post here automatically — so your members hear about new Spartacus features without visiting the
        dashboard.
      </p>
      <ChannelSelect
        guildId={guildId}
        value={alertSettings?.botUpdatesChannelId ?? null}
        onChange={update}
        kind="text"
        placeholder="Off — not posting anywhere"
      />
    </NeonCard>
  );
}

export default function StatusChannelPage({ params }: { params: { guildId: string } }) {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="STATUS_CHANNEL"
        title="Status Channel"
        description="Posts a live embed to a channel of your choosing showing whether Spartacus is online, refreshed every minute."
      />

      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ActiveChannelsCard key={refreshKey} guildId={params.guildId} />
          <AddChannelCard guildId={params.guildId} onAdded={() => setRefreshKey((k) => k + 1)} />
        </div>

        <UptimeHistoryCard guildId={params.guildId} />
        <BotUpdatesChannelCard guildId={params.guildId} />
      </div>
    </div>
  );
}
