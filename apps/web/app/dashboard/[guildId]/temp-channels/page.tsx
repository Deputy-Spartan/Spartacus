"use client";

import { useEffect, useRef, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { PlaceholderExamples } from "../../../../components/ui/PlaceholderExamples";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { api, type DiscordChannelOption, type TempChannelLobbyRow } from "../../../../lib/api";

type Tab = "active" | "create";

function EmptyState({ icon, title, desc, action }: { icon: string; title: string; desc: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="w-12 h-12 rounded-lg bg-base-800 border border-white/5 flex items-center justify-center text-xl mb-4">{icon}</div>
      <p className="font-semibold mb-1.5">{title}</p>
      <p className="text-sm text-slate-500 max-w-md mb-5">{desc}</p>
      {action}
    </div>
  );
}

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

// The full field set — shared by the inline editor on an existing lobby
// (Active tab) and the fresh-draft form (Create tab), just wired to
// whichever value/onChange the caller passes in.
function LobbyFields({
  guildId,
  value,
  onChange,
}: {
  guildId: string;
  value: Partial<TempChannelLobbyRow>;
  onChange: (patch: Partial<TempChannelLobbyRow>) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        <div>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Lobby Voice Channel</label>
          <ChannelSelect guildId={guildId} kind="voice" value={value.lobbyChannelId ?? null} onChange={(id) => onChange({ lobbyChannelId: id ?? "" })} />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Spawn Category</label>
          <ChannelSelect guildId={guildId} kind="category" value={value.categoryId ?? null} onChange={(id) => onChange({ categoryId: id })} />
        </div>
        <NameFormatField value={value.nameFormat ?? ""} onChange={(v) => onChange({ nameFormat: v })} />
        <div>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">User Limit (0 = unlimited)</label>
          <input
            type="number"
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            value={value.userLimit ?? 0}
            onChange={(e) => onChange({ userLimit: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Bitrate (bps)</label>
          <input
            type="number"
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            value={value.bitrate ?? 64000}
            onChange={(e) => onChange({ bitrate: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Delete After Empty (sec)</label>
          <input
            type="number"
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            value={value.deleteAfterEmptySec ?? 0}
            onChange={(e) => onChange({ deleteAfterEmptySec: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="flex gap-6 text-xs text-slate-400">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!value.pairTextChannel} onChange={(e) => onChange({ pairTextChannel: e.target.checked })} />
          Pair a text channel
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!value.hideTextFromNonMembers} onChange={(e) => onChange({ hideTextFromNonMembers: e.target.checked })} />
          Hide text from non-members
        </label>
      </div>
    </>
  );
}

export default function TempChannelsPage({ params }: { params: { guildId: string } }) {
  const confirm = useConfirm();
  const guildId = params.guildId;
  const [tab, setTab] = useState<Tab>("active");
  const [lobbies, setLobbies] = useState<TempChannelLobbyRow[]>([]);
  const [channelOptions, setChannelOptions] = useState<DiscordChannelOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<TempChannelLobbyRow>>(EMPTY);
  const [creating, setCreating] = useState(false);

  function refresh() {
    api.getTempChannelLobbies(guildId).then(setLobbies);
    api.getDiscordChannels(guildId).then((r) => {
      setChannelOptions([...r.textChannels, ...r.voiceChannels]);
      setCategoryOptions(r.categories);
    });
  }
  useEffect(refresh, [guildId]);

  function channelLabel(id: string | null): string {
    if (!id) return "Not set";
    const c = channelOptions.find((c) => c.id === id);
    if (c) return c.categoryName ? `${c.categoryName} / #${c.name}` : `#${c.name}`;
    const cat = categoryOptions.find((c) => c.id === id);
    return cat ? cat.name : `#${id}`;
  }

  async function updateLobby(id: string, patch: Partial<TempChannelLobbyRow>) {
    setLobbies((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    await api.updateTempChannelLobby(guildId, id, patch);
  }

  async function removeLobby(id: string) {
    if (!(await confirm("Delete this temp channel lobby?"))) return;
    await api.deleteTempChannelLobby(guildId, id);
    if (expandedId === id) setExpandedId(null);
    refresh();
  }

  async function createLobby() {
    if (!draft.lobbyChannelId) return;
    setCreating(true);
    try {
      await api.addTempChannelLobby(guildId, draft);
      setDraft(EMPTY);
      setTab("active");
      refresh();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <ModuleHeader
        guildId={guildId}
        moduleKey="TEMP_CHANNELS"
        title="Temp Channels"
        description="Members joining the lobby voice channel get their own personal voice channel spawned under the chosen category — it deletes itself once empty."
      />

      <div className="flex gap-1 mb-5 border-b border-white/5">
        <button
          onClick={() => setTab("active")}
          className={[
            "px-4 py-2 text-sm border-b-2 transition-colors",
            tab === "active" ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
          ].join(" ")}
        >
          Active Lobbies
        </button>
        <button
          onClick={() => {
            setDraft(EMPTY);
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
        (lobbies.length === 0 ? (
          <NeonCard>
            <EmptyState
              icon="🔊"
              title="No temp channel lobbies yet"
              desc="Create one to let members spawn their own personal voice channel by joining a lobby."
              action={
                <button onClick={() => setTab("create")} className="neon-button">
                  + Create New
                </button>
              }
            />
          </NeonCard>
        ) : (
          <div className="space-y-3">
            {lobbies.map((l) => (
              <NeonCard key={l.id}>
                <div className="flex items-center justify-between gap-3">
                  <button className="min-w-0 flex-1 text-left" onClick={() => setExpandedId(expandedId === l.id ? null : l.id)}>
                    <p className="text-sm font-medium truncate">{l.name}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {channelLabel(l.lobbyChannelId)} → {channelLabel(l.categoryId)} · limit {l.userLimit || "∞"} · {l.bitrate / 1000}kbps
                    </p>
                  </button>
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={() => setExpandedId(expandedId === l.id ? null : l.id)} className="text-xs text-slate-500 hover:text-neon-blue">
                      {expandedId === l.id ? "Close" : "Edit"}
                    </button>
                    <button onClick={() => removeLobby(l.id)} className="text-xs text-slate-500 hover:text-rose-400">
                      Remove
                    </button>
                  </div>
                </div>

                {expandedId === l.id && (
                  <div className="mt-4 pt-4 border-t border-white/5 space-y-4">
                    <div>
                      <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Lobby Name</label>
                      <input
                        className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                        value={l.name}
                        onChange={(e) => updateLobby(l.id, { name: e.target.value })}
                      />
                    </div>
                    <LobbyFields guildId={guildId} value={l} onChange={(patch) => updateLobby(l.id, patch)} />
                  </div>
                )}
              </NeonCard>
            ))}
          </div>
        ))}

      {tab === "create" && (
        <NeonCard>
          <p className="font-medium mb-3">New Lobby</p>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Lobby Name</label>
            <input
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
              value={draft.name ?? ""}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>
          <div className="space-y-4 mb-4">
            <LobbyFields guildId={guildId} value={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} />
          </div>
          <button onClick={createLobby} disabled={!draft.lobbyChannelId || creating} className="neon-button disabled:opacity-50">
            {creating ? "Creating…" : "Create Lobby"}
          </button>
        </NeonCard>
      )}
    </div>
  );
}
