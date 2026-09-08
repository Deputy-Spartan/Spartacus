"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { api, type CustomCommand } from "../../../../lib/api";

export default function CommandsPage({ params }: { params: { guildId: string } }) {
  const [commands, setCommands] = useState<CustomCommand[]>([]);
  const [trigger, setTrigger] = useState("");
  const [response, setResponse] = useState("");

  function refresh() {
    api.getCommands(params.guildId).then(setCommands);
  }

  useEffect(refresh, [params.guildId]);

  async function add() {
    if (!trigger || !response) return;
    await api.addCommand(params.guildId, trigger.replace(/^!/, ""), response);
    setTrigger("");
    setResponse("");
    refresh();
  }

  async function remove(id: string) {
    await api.deleteCommand(params.guildId, id);
    refresh();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Custom Commands</h1>
      <p className="text-slate-400 mb-6">Text triggers the bot responds to instantly, e.g. !socials.</p>

      <NeonCard>
        <div className="flex gap-3 mb-4">
          <input
            className="w-40 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
            placeholder="!trigger"
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
          />
          <input
            className="flex-1 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
            placeholder="Response text…"
            value={response}
            onChange={(e) => setResponse(e.target.value)}
          />
          <button onClick={add} className="neon-button shrink-0">
            Add
          </button>
        </div>

        <div className="divide-y divide-white/5">
          {commands.map((c) => (
            <div key={c.id} className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-neon-blue font-medium w-32 shrink-0">!{c.trigger}</span>
              <span className="text-slate-400 flex-1 truncate">{c.response}</span>
              <button onClick={() => remove(c.id)} className="text-slate-500 hover:text-rose-400 text-xs ml-3">
                Remove
              </button>
            </div>
          ))}
          {commands.length === 0 && <p className="text-sm text-slate-500 py-2">No custom commands yet.</p>}
        </div>
      </NeonCard>
    </div>
  );
}
