"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { api, type StickyMessageRow } from "../../../../lib/api";

export default function StickyMessagesPage({ params }: { params: { guildId: string } }) {
  const [rows, setRows] = useState<StickyMessageRow[]>([]);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [content, setContent] = useState("");

  function refresh() {
    api.getStickyMessages(params.guildId).then(setRows);
  }
  useEffect(refresh, [params.guildId]);

  async function add() {
    if (!channelId || !content) return;
    await api.addStickyMessage(params.guildId, channelId, content);
    setContent("");
    refresh();
  }

  async function remove(id: string) {
    await api.deleteStickyMessage(params.guildId, id);
    refresh();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Sticky Messages</h1>
      <p className="text-slate-400 mb-6">
        The bot reposts this message to the bottom of the channel every time someone else sends a message there.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NeonCard>
          <p className="font-medium mb-3">Active Stickies</p>
          {rows.length === 0 && <p className="text-sm text-slate-500">None yet.</p>}
          <div className="divide-y divide-white/5">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2.5 text-sm gap-3">
                <span className="text-slate-400 truncate">{r.content}</span>
                <button onClick={() => remove(r.id)} className="text-slate-500 hover:text-rose-400 text-xs shrink-0">
                  Remove
                </button>
              </div>
            ))}
          </div>
        </NeonCard>

        <NeonCard>
          <p className="font-medium mb-3">Add Sticky</p>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Channel</label>
          <ChannelSelect guildId={params.guildId} value={channelId} onChange={setChannelId} />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Message</label>
          <textarea
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4 min-h-20"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />

          <button onClick={add} className="neon-button">
            Set Sticky
          </button>
        </NeonCard>
      </div>
    </div>
  );
}
