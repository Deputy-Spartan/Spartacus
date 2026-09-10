"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { Required } from "../../../../components/ui/Required";
import { FormError } from "../../../../components/ui/FormError";
import { api, type StreamSubscription } from "../../../../lib/api";

export default function StreamAlertsPage({ params }: { params: { guildId: string } }) {
  const confirm = useConfirm();
  const [subs, setSubs] = useState<StreamSubscription[]>([]);
  const [platform, setPlatform] = useState<"twitch" | "youtube">("twitch");
  const [channelName, setChannelName] = useState("");
  const [announceChannelId, setAnnounceChannelId] = useState("");
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.getStreamSubscriptions(params.guildId).then(setSubs);
  }

  useEffect(refresh, [params.guildId]);

  async function add() {
    if (!channelName || !announceChannelId) {
      setError("Enter a channel name and an announce channel ID before adding.");
      return;
    }
    setError(null);
    await api.addStreamSubscription(params.guildId, { platform, channelName, announceChannelId });
    setChannelName("");
    setAnnounceChannelId("");
    refresh();
  }

  async function remove(id: string) {
    if (!(await confirm("Remove this stream alert subscription?"))) return;
    await api.deleteStreamSubscription(params.guildId, id);
    refresh();
  }

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="STREAM_ALERTS"
        title="Stream Alerts"
        description="Ping a channel the moment a subscribed creator goes live."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NeonCard>
          <p className="font-medium mb-3">Subscriptions</p>
          {subs.length === 0 && <p className="text-sm text-slate-500">No subscriptions yet.</p>}
          <div className="divide-y divide-white/5">
            {subs.map((sub) => (
              <div key={sub.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium">{sub.channelName}</p>
                  <p className="text-xs text-slate-500 capitalize">{sub.platform}</p>
                </div>
                <div className="flex items-center gap-3">
                  {sub.isLive ? (
                    <span className="text-xs font-semibold text-rose-400 border border-rose-400/40 rounded px-2 py-0.5">
                      LIVE
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500">Offline</span>
                  )}
                  <button onClick={() => remove(sub.id)} className="text-slate-500 hover:text-rose-400 text-xs">
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </NeonCard>

        <NeonCard>
          <p className="font-medium mb-3">Add Subscription</p>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Platform</label>
          <select
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            value={platform}
            onChange={(e) => setPlatform(e.target.value as "twitch" | "youtube")}
          >
            <option value="twitch">Twitch</option>
            <option value="youtube">YouTube</option>
          </select>

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
            Channel Name
            <Required />
          </label>
          <input
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            placeholder="e.g. ironlegion_gg"
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
          />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
            Announce Channel ID
            <Required />
          </label>
          <input
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            placeholder="123456789012345678"
            value={announceChannelId}
            onChange={(e) => setAnnounceChannelId(e.target.value)}
          />

          <button onClick={add} className="neon-button">
            Add Subscription
          </button>
          <FormError message={error} />
        </NeonCard>
      </div>
    </div>
  );
}
