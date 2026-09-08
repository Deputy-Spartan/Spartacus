"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { api, type GiveawayRow } from "../../../../lib/api";

export default function GiveawaysPage({ params }: { params: { guildId: string } }) {
  const [rows, setRows] = useState<GiveawayRow[]>([]);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [prize, setPrize] = useState("");
  const [winnerCount, setWinnerCount] = useState(1);
  const [endsAt, setEndsAt] = useState("");

  function refresh() {
    api.getGiveaways(params.guildId).then(setRows);
  }
  useEffect(refresh, [params.guildId]);

  async function create() {
    if (!channelId || !prize || !endsAt) return;
    await api.addGiveaway(params.guildId, { channelId, prize, winnerCount, endsAt });
    setPrize("");
    refresh();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Giveaways</h1>
      <p className="text-slate-400 mb-6">
        The bot posts an Enter button in the chosen channel and automatically picks a winner when it ends.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NeonCard>
          <p className="font-medium mb-3">Active &amp; Past Giveaways</p>
          {rows.length === 0 && <p className="text-sm text-slate-500">No giveaways yet.</p>}
          <div className="divide-y divide-white/5">
            {rows.map((g) => (
              <div key={g.id} className="py-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{g.prize}</span>
                  <span className="text-xs text-slate-500">{g.ended ? "Ended" : "Active"}</span>
                </div>
                <p className="text-xs text-slate-500">
                  {g.entries.length} entries · {g.winnerCount} winner(s) · ends {new Date(g.endsAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </NeonCard>

        <NeonCard>
          <p className="font-medium mb-3">Create Giveaway</p>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Channel</label>
          <ChannelSelect guildId={params.guildId} value={channelId} onChange={setChannelId} />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Prize</label>
          <input
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            value={prize}
            onChange={(e) => setPrize(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Winners</label>
              <input
                type="number"
                min={1}
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                value={winnerCount}
                onChange={(e) => setWinnerCount(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Ends At</label>
              <input
                type="datetime-local"
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>

          <button onClick={create} className="neon-button">
            Start Giveaway
          </button>
        </NeonCard>
      </div>
    </div>
  );
}
