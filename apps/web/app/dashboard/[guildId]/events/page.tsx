"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { api, type EventRow } from "../../../../lib/api";

const ROLE_ICONS: Record<string, string> = {
  TANK: "🛡️",
  DPS: "⚔️",
  HEALER: "✨",
  ATTENDING: "✅",
  ABSENT: "❌",
  TENTATIVE: "❔",
};

export default function EventsPage({ params }: { params: { guildId: string } }) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [channelId, setChannelId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [creating, setCreating] = useState(false);

  function refresh() {
    api.getEvents(params.guildId).then(setEvents);
  }

  useEffect(refresh, [params.guildId]);

  async function create() {
    if (!title || !channelId || !startTime) return;
    setCreating(true);
    await api.createEvent(params.guildId, { title, description, channelId, startTime });
    setTitle("");
    setDescription("");
    setChannelId("");
    setStartTime("");
    setCreating(false);
    refresh();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Events</h1>
      <p className="text-slate-400 mb-6">Create a raid, stream, or meeting — signups sync live in Discord.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NeonCard>
          <p className="font-medium mb-3">Create Event</p>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Title</label>
          <input
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Description</label>
          <textarea
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4 min-h-16"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Channel ID</label>
              <input
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Start Time</label>
              <input
                type="datetime-local"
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
          </div>
          <button onClick={create} disabled={creating} className="neon-button">
            {creating ? "Posting…" : "Post Signup Sheet"}
          </button>
        </NeonCard>

        <NeonCard>
          <p className="font-medium mb-3">Upcoming Events</p>
          {events.length === 0 && <p className="text-sm text-slate-500">No events scheduled.</p>}
          <div className="space-y-3">
            {events.map((event) => {
              const counts = event.signups.reduce<Record<string, number>>((acc, s) => {
                acc[s.role] = (acc[s.role] ?? 0) + 1;
                return acc;
              }, {});
              return (
                <div key={event.id} className="rounded-lg p-3 bg-base-950 border-l-2 border-neon-blue">
                  <p className="text-sm font-semibold">⚔️ {event.title}</p>
                  <p className="text-xs text-slate-500 mt-1">{new Date(event.startTime).toLocaleString()}</p>
                  <div className="flex gap-3 mt-2 text-xs text-slate-400">
                    {Object.entries(counts).map(([role, count]) => (
                      <span key={role}>
                        {ROLE_ICONS[role] ?? ""} {count}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </NeonCard>
      </div>
    </div>
  );
}
