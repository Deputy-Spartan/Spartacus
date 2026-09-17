"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { Required } from "../../../../components/ui/Required";
import { FormError } from "../../../../components/ui/FormError";
import { api, type StreamSubscription } from "../../../../lib/api";

type Tab = "active" | "create";

export default function StreamAlertsPage({ params }: { params: { guildId: string } }) {
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("active");
  const [subs, setSubs] = useState<StreamSubscription[]>([]);
  const [platform, setPlatform] = useState<"twitch" | "youtube">("twitch");
  const [channelName, setChannelName] = useState("");
  const [announceChannelId, setAnnounceChannelId] = useState("");
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.getStreamSubscriptions(params.guildId).then(setSubs);
  }

  useEffect(refresh, [params.guildId]);

  function resetDraft() {
    setPlatform("twitch");
    setChannelName("");
    setAnnounceChannelId("");
    setError(null);
  }

  async function add() {
    if (!channelName || !announceChannelId) {
      setError("Enter a channel name and an announce channel ID before adding.");
      return;
    }
    setError(null);
    await api.addStreamSubscription(params.guildId, { platform, channelName, announceChannelId });
    resetDraft();
    setTab("active");
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

      <div className="flex gap-1 mb-5 border-b border-white/5">
        <button
          onClick={() => setTab("active")}
          className={[
            "px-4 py-2 text-sm border-b-2 transition-colors",
            tab === "active" ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
          ].join(" ")}
        >
          Active Subscriptions
        </button>
        <button
          onClick={() => {
            resetDraft();
            setTab("create");
          }}
          className={[
            "px-4 py-2 text-sm border-b-2 transition-colors",
            tab === "create" ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
          ].join(" ")}
        >
          + Create New
        </button>
      </div>

      {tab === "active" &&
        (subs.length === 0 ? (
          <NeonCard>
            <div className="text-center py-10">
              <p className="text-sm text-slate-400 mb-1">No subscriptions yet.</p>
              <p className="text-xs text-slate-600 mb-4">Subscribe to a creator to get notified when they go live.</p>
              <button onClick={() => setTab("create")} className="neon-button-sm">
                + Create New
              </button>
            </div>
          </NeonCard>
        ) : (
          <NeonCard>
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
        ))}

      {tab === "create" && (
        <NeonCard className="max-w-lg">
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
      )}
    </div>
  );
}
