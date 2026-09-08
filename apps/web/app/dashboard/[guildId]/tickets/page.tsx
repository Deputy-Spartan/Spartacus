"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { api, type TicketPanelRow, type TicketRow } from "../../../../lib/api";

export default function TicketsPage({ params }: { params: { guildId: string } }) {
  const [panels, setPanels] = useState<TicketPanelRow[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [name, setName] = useState("Support");
  const [channelId, setChannelId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [supportRoleId, setSupportRoleId] = useState<string | null>(null);
  const [buttonLabel, setButtonLabel] = useState("Open a Ticket");

  function refresh() {
    api.getTicketPanels(params.guildId).then(setPanels);
    api.getTickets(params.guildId).then(setTickets);
  }
  useEffect(refresh, [params.guildId]);

  async function createPanel() {
    if (!channelId) return;
    await api.addTicketPanel(params.guildId, { name, channelId, categoryId, buttonLabel, supportRoleId });
    refresh();
  }

  async function removePanel(id: string) {
    await api.deleteTicketPanel(params.guildId, id);
    refresh();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Tickets</h1>
      <p className="text-slate-400 mb-6">
        The bot posts a button panel to the chosen channel — clicking it opens a private ticket channel under the chosen category.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <NeonCard>
          <p className="font-medium mb-3">Panels</p>
          {panels.length === 0 && <p className="text-sm text-slate-500">No panels yet.</p>}
          <div className="divide-y divide-white/5">
            {panels.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-slate-500">"{p.buttonLabel}"</p>
                </div>
                <button onClick={() => removePanel(p.id)} className="text-slate-500 hover:text-rose-400 text-xs">
                  Remove
                </button>
              </div>
            ))}
          </div>
        </NeonCard>

        <NeonCard>
          <p className="font-medium mb-3">Create Panel</p>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Panel Name</label>
          <input
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Post In Channel</label>
          <ChannelSelect guildId={params.guildId} value={channelId} onChange={setChannelId} />
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">New Ticket Category</label>
          <ChannelSelect guildId={params.guildId} kind="category" value={categoryId} onChange={setCategoryId} />
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Support Role</label>
          <RoleSelect guildId={params.guildId} value={supportRoleId} onChange={setSupportRoleId} />
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Button Label</label>
          <input
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            value={buttonLabel}
            onChange={(e) => setButtonLabel(e.target.value)}
          />
          <button onClick={createPanel} className="neon-button">
            Post Panel
          </button>
        </NeonCard>
      </div>

      <NeonCard>
        <p className="font-medium mb-3">Open Tickets</p>
        {tickets.length === 0 && <p className="text-sm text-slate-500">No open tickets.</p>}
        <div className="divide-y divide-white/5">
          {tickets.map((t) => (
            <div key={t.id} className="flex items-center justify-between py-2.5 text-sm">
              <span>
                <span className="text-neon-blue">#{t.channelId.slice(0, 6)}</span> — opened by user {t.userId}
              </span>
              <span className="text-xs text-slate-500">{t.status}</span>
            </div>
          ))}
        </div>
      </NeonCard>
    </div>
  );
}
