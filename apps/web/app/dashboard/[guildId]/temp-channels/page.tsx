"use client";

import { useEffect, useRef, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { PlaceholderExamples } from "../../../../components/ui/PlaceholderExamples";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { api, type TempChannelLobbyRow } from "../../../../lib/api";

const NAME_FORMAT_TOKENS = [
  { token: "{user}", description: "The joining member's display name" },
  { token: "{index}", description: "Counts up as new channels are created (1, 2, 3…) — resets as channels empty out" },
  { token: "{count}", description: "Same as {index}, if you prefer the alias" },
  { token: "{guild}", description: "This server's name" },
];

const EMPTY: Partial<TempChannelLobbyRow> = {
  name: "New Lobby",
  lobbyChannelId: "",
  categoryId: null,
  nameFormat: "{user}'s Channel",
  userLimit: 0,
  bitrate: 64000,
  deleteAfterEmptySec: 0,
  pairTextChannel: false,
  hideTextFromNonMembers: true,
};

function NameFormatField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Channel Name Format</label>
      <input
        ref={ref}
        className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <PlaceholderExamples items={NAME_FORMAT_TOKENS} inputRef={ref} value={value} onChange={onChange} />
    </div>
  );
}

export default function TempChannelsPage({ params }: { params: { guildId: string } }) {
  const confirm = useConfirm();
  const [lobbies, setLobbies] = useState<TempChannelLobbyRow[]>([]);

  function refresh() {
    api.getTempChannelLobbies(params.guildId).then(setLobbies);
  }
  useEffect(refresh, [params.guildId]);

  async function addLobby() {
    await api.addTempChannelLobby(params.guildId, EMPTY);
    refresh();
  }

  async function updateLobby(id: string, patch: Partial<TempChannelLobbyRow>) {
    setLobbies((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    await api.updateTempChannelLobby(params.guildId, id, patch);
  }

  async function removeLobby(id: string) {
    if (!(await confirm("Delete this temp channel lobby?"))) return;
    await api.deleteTempChannelLobby(params.guildId, id);
    refresh();
  }

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="TEMP_CHANNELS"
        title="Temp Channels"
        description="Members joining the lobby voice channel get their own personal voice channel spawned under the chosen category — it deletes itself once empty."
      />

      <div className="space-y-4">
        {lobbies.map((l) => (
          <NeonCard key={l.id}>
            <div className="flex items-center justify-between mb-3">
              <input
                className="bg-transparent text-sm font-semibold outline-none border-b border-transparent focus:border-neon-blue max-w-xs"
                value={l.name}
                onChange={(e) => updateLobby(l.id, { name: e.target.value })}
              />
              <button onClick={() => removeLobby(l.id)} className="text-slate-500 hover:text-rose-400 text-xs">
                Remove
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Lobby Voice Channel</label>
                <ChannelSelect
                  guildId={params.guildId}
                  kind="voice"
                  value={l.lobbyChannelId}
                  onChange={(id) => updateLobby(l.id, { lobbyChannelId: id })}
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Spawn Category</label>
                <ChannelSelect
                  guildId={params.guildId}
                  kind="category"
                  value={l.categoryId}
                  onChange={(id) => updateLobby(l.id, { categoryId: id })}
                />
              </div>
              <NameFormatField value={l.nameFormat} onChange={(v) => updateLobby(l.id, { nameFormat: v })} />
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">User Limit (0 = unlimited)</label>
                <input
                  type="number"
                  className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
                  value={l.userLimit}
                  onChange={(e) => updateLobby(l.id, { userLimit: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Bitrate (bps)</label>
                <input
                  type="number"
                  className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
                  value={l.bitrate}
                  onChange={(e) => updateLobby(l.id, { bitrate: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Delete After Empty (sec)</label>
                <input
                  type="number"
                  className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
                  value={l.deleteAfterEmptySec}
                  onChange={(e) => updateLobby(l.id, { deleteAfterEmptySec: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="flex gap-6 text-xs text-slate-400">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={l.pairTextChannel}
                  onChange={(e) => updateLobby(l.id, { pairTextChannel: e.target.checked })}
                />
                Pair a text channel
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={l.hideTextFromNonMembers}
                  onChange={(e) => updateLobby(l.id, { hideTextFromNonMembers: e.target.checked })}
                />
                Hide text from non-members
              </label>
            </div>
          </NeonCard>
        ))}
      </div>

      <div className="flex items-center justify-between mt-4">
        <p className="text-xs text-slate-500">Pick a lobby channel and category, then tweak per-lobby. Changes save automatically.</p>
        <button onClick={addLobby} className="neon-button">
          + Add Lobby
        </button>
      </div>
    </div>
  );
}
