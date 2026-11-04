"use client";

import { useEffect, useRef, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { PlaceholderExamples } from "../../../../components/ui/PlaceholderExamples";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { api, type DiscordChannelOption, type TempChannelLobbyRow } from "../../../../lib/api";
import { BLUEPRINT_GAMES, DEFAULT_BLUEPRINT_GAMES, MAX_TEMP_GAMES, SERVER_EMOJI, blueprintGameChoices, fillTempName, type TempGameChoice } from "@spartacus/shared";
import { EmojiPicker } from "../../../../components/ui/EmojiPicker";

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
  gamePicker: false,
  gameChoices: [],
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

// Name Format names the channel straight away. Game Picker does too, then
// asks the creator what they're playing and renames it for that game.
function NamingMode({ gamePicker, onChange }: { gamePicker: boolean; onChange: (gamePicker: boolean) => void }) {
  const modes = [
    { on: false, title: "Name Format", desc: "Channels are named from the Channel Name Format above, like Kuro's Channel. No menu." },
    { on: true, title: "Game Picker", desc: 'Same start, then the creator gets a "What are you playing?" menu that renames it for their game, like 🟧 R6 Squad 1.' },
  ];
  return (
    <div>
      <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">How New Channels Get Named</label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {modes.map((m) => (
          <button
            key={m.title}
            type="button"
            onClick={() => onChange(m.on)}
            aria-pressed={gamePicker === m.on}
            className={[
              "text-left rounded-lg border p-3 transition-colors",
              gamePicker === m.on ? "border-neon-blue bg-neon-blue/10" : "border-white/10 bg-base-950 hover:border-white/20",
            ].join(" ")}
          >
            <p className="text-sm font-medium">{m.title}</p>
            <p className="text-xs text-slate-500 mt-0.5">{m.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// The "What are you playing?" menu posted in each new channel. Picking a
// game renames the channel to that game's name and sets its limit.
function GameChoicesField({ guildId, value, onChange }: { guildId: string; value: TempGameChoice[]; onChange: (next: TempGameChoice[]) => void }) {
  const set = (i: number, patch: Partial<TempGameChoice>) => onChange(value.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  // A new emoji also replaces the old one at the start of the channel name.
  // Server emojis can't go in channel names, so those only change the menu.
  const setEmoji = (i: number, emoji: string) => {
    const g = value[i];
    const old = g.emoji ?? "";
    const rest = old && g.nameFormat.startsWith(old) ? g.nameFormat.slice(old.length).trimStart() : g.nameFormat;
    const changed = old && g.nameFormat.startsWith(old);
    const nameFormat = changed ? (emoji && !SERVER_EMOJI.test(emoji) ? `${emoji} ${rest}` : rest) : g.nameFormat;
    set(i, { emoji, nameFormat });
  };
  const move = (i: number, by: number) => {
    const next = [...value];
    const [g] = next.splice(i, 1);
    next.splice(i + by, 0, g);
    onChange(next);
  };
  const missing = BLUEPRINT_GAMES.filter((b) => !value.some((g) => g.label.toLowerCase() === b.name.toLowerCase()));
  const input = "bg-base-950 border border-white/10 rounded-lg p-2 text-sm min-w-0";
  return (
    <div className="rounded-lg border border-white/10 bg-base-950/50 p-3">
      <p className="text-sm font-medium">Games</p>
      <p className="text-xs text-slate-500 mb-3">
        The menu lists these games. Picking one renames the channel to that game's channel name and sets its limit. A Custom name option is always
        included.
      </p>
      {value.length > 0 && (
        <div className="space-y-3 mb-3">
          <div className="hidden sm:grid grid-cols-[8.5rem_1fr_1fr_4.5rem_4.5rem] gap-2 text-[11px] uppercase tracking-wide text-slate-500">
            <span>Emoji</span>
            <span>Game</span>
            <span>Channel Name</span>
            <span>Limit</span>
            <span />
          </div>
          {value.map((g, i) => (
            <div key={i}>
              <div className="grid grid-cols-[8.5rem_1fr] sm:grid-cols-[8.5rem_1fr_1fr_4.5rem_4.5rem] gap-2 items-center">
                <EmojiPicker guildId={guildId} value={g.emoji ?? ""} onChange={(emoji) => setEmoji(i, emoji)} popover placeholder="Emoji" />
                <input className={input} value={g.label} maxLength={80} placeholder="Game name" onChange={(e) => set(i, { label: e.target.value })} />
                <input className={input + " col-span-2 sm:col-span-1"} value={g.nameFormat} maxLength={90} placeholder="🎮 Squad {index}" onChange={(e) => set(i, { nameFormat: e.target.value })} />
                <input type="number" min={0} max={99} className={input} value={g.userLimit ?? 0} onChange={(e) => set(i, { userLimit: Number(e.target.value) })} />
                <div className="flex items-center justify-end gap-2 text-xs text-slate-500">
                  <button disabled={i === 0} onClick={() => move(i, -1)} className="hover:text-neon-blue disabled:opacity-30" aria-label="Move up">▲</button>
                  <button disabled={i === value.length - 1} onClick={() => move(i, 1)} className="hover:text-neon-blue disabled:opacity-30" aria-label="Move down">▼</button>
                  <button onClick={() => onChange(value.filter((_, j) => j !== i))} className="hover:text-rose-400" aria-label="Remove">✕</button>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 pl-1">
                Becomes <span className="text-slate-300">🔊 {fillTempName(g.nameFormat || g.label, { user: "Kuro", index: 1, guild: "Server" })}</span>
                {g.userLimit ? ` · ${g.userLimit} players` : " · no limit"}
              </p>
            </div>
          ))}
        </div>
      )}
      {value.length < MAX_TEMP_GAMES && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => onChange([...value, { label: "", emoji: "🎮", nameFormat: "🎮 Squad {index}", userLimit: 0 }])} className="neon-button text-xs">
            + Add Game
          </button>
          {missing.map((b) => (
            <button
              key={b.id}
              onClick={() =>
                onChange([...value, { label: b.name, emoji: b.emoji, nameFormat: b.id === "other" ? `${b.emoji} {user}'s Squad` : `${b.emoji} ${b.short} Squad {index}`, userLimit: b.squad }])
              }
              className="text-xs rounded-full border border-white/10 px-3 py-1 text-slate-400 hover:border-neon-blue hover:text-neon-blue"
            >
              + {b.emoji} {b.name}
            </button>
          ))}
        </div>
      )}
      <p className="text-[11px] text-slate-500 mt-3">
        Pick any standard emoji or one of this server's own. Server emojis show in the menu, but Discord only allows standard emojis in channel
        names, so they're left out of the name. Channel names can use {"{user}"} and {"{index}"}. {"{index}"} takes the lowest free number, so two R6 squads are R6 Squad 1 and R6 Squad 2.
        Discord allows 2 renames per channel every 10 minutes.
      </p>
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

      <NamingMode
        gamePicker={!!value.gamePicker}
        onChange={(gamePicker) => {
          // Turning the picker on with no games starts from the usual ones.
          const empty = !(value.gameChoices ?? []).length;
          onChange(gamePicker && empty ? { gamePicker, gameChoices: blueprintGameChoices(DEFAULT_BLUEPRINT_GAMES) } : { gamePicker });
        }}
      />
      {value.gamePicker && <GameChoicesField guildId={guildId} value={value.gameChoices ?? []} onChange={(gameChoices) => onChange({ gameChoices })} />}
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
                      {channelLabel(l.lobbyChannelId)} → {channelLabel(l.categoryId)} · limit {l.userLimit || "∞"} · {l.bitrate / 1000}kbps · {l.gamePicker ? "Game Picker" : "Name Format"}
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
