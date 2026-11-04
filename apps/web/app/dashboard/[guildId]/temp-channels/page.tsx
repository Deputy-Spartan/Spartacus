"use client";

import { useEffect, useRef, useState } from "react";
import { MarkdownToolbar } from "../../../../components/ui/MarkdownToolbar";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { PlaceholderExamples } from "../../../../components/ui/PlaceholderExamples";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { api, type DiscordChannelOption, type TempChannelLobbyRow } from "../../../../lib/api";
import { BLUEPRINT_GAMES, DEFAULT_BLUEPRINT_GAMES, MAX_TEMP_GAMES, SERVER_EMOJI, SERVER_EMOJI_LOOSE, TEMP_GUIDE_DEFAULT, blueprintGameChoices, fillTempName, type TempGameChoice } from "@spartacus/shared";
import { EmojiPicker } from "../../../../components/ui/EmojiPicker";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { EditableText } from "../../../../components/ui/EditableText";
import { DiscordButton, DiscordButtonRow, DiscordEmbed, DiscordMessage, DiscordSelect } from "../../../../components/ui/DiscordPreview";
import { useDiscordNames } from "../../../../components/ui/DiscordMarkdown";

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
  { token: "{index}", description: "The lowest free number in the category (1, 2, 3…)" },
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
  joinToCreate: true,
  gamePicker: false,
  gameCategories: false,
  gameChoices: [],
  panelChannelId: null,
  panelTitle: "🔊 Create a Squad",
  panelText: "Pick the game you're playing below and Spartacus makes a voice channel for your squad.\n\nOr join {lobby} to make one straight away.",
  panelColor: 0x5865f2,
  controlsWhere: "VOICE",
  controlsChannelId: null,
  guideButton: true,
  panelGuide: null,
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


// The "What are you playing?" menu posted in each new channel. Picking a
// game renames the channel to that game's name and sets its limit.
function GameChoicesField({ guildId, value, onChange }: { guildId: string; value: TempGameChoice[]; onChange: (next: TempGameChoice[]) => void }) {
  // Server emoji ids, to flag a code that isn't one of this server's emojis.
  const [serverEmojis, setServerEmojis] = useState<Set<string> | null>(null);
  useEffect(() => {
    api.getDiscordEmojis(guildId).then((list) => setServerEmojis(new Set(list.map((e) => e.id)))).catch(() => null);
  }, [guildId]);
  const brokenEmoji = (emoji?: string) => {
    const m = emoji?.match(SERVER_EMOJI_LOOSE);
    return !!m && !!serverEmojis && !(m[3] && serverEmojis.has(m[3]) && SERVER_EMOJI.test(emoji!));
  };
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
              {brokenEmoji(g.emoji) && (
                <p className="text-[11px] text-rose-400 mt-1 pl-1">
                  This emoji isn't one of this server's emojis, so Discord can't show it. Pick it again from Server emojis. Until then it's left off.
                </p>
              )}
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

// One numbered step of the lobby setup.
// Optional steps pass `on` and `onToggle` and get a switch; required steps don't.
function Step({
  id,
  n,
  title,
  desc,
  on,
  onToggle,
  children,
}: {
  id: string;
  n: number;
  title: string;
  desc: string;
  on?: boolean;
  onToggle?: (on: boolean) => void;
  children: React.ReactNode;
}) {
  const optional = onToggle !== undefined;
  const open = !optional || on;
  return (
    <section className={["rounded-lg border p-4 transition-colors", open ? "border-white/10 bg-base-950/40" : "border-white/5 bg-base-950/20"].join(" ")}>
      <div className={["flex gap-3", open ? "mb-3" : ""].join(" ")}>
        <span className={["w-6 h-6 shrink-0 rounded-full bg-base-800 text-xs flex items-center justify-center", open ? "text-neon-blue" : "text-slate-500"].join(" ")}>{n}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            <EditableText id={`temp.step.${id}.title`}>{title}</EditableText>
          </p>
          <p className="text-xs text-slate-500">
            <EditableText id={`temp.step.${id}.desc`}>{desc}</EditableText>
          </p>
        </div>
        {optional && (
          <div className="flex items-center gap-2 shrink-0 self-start">
            <span className="text-xs text-slate-500">{on ? "On" : "Off"}</span>
            <ToggleSwitch enabled={!!on} onChange={onToggle} label={`Turn ${title} on or off`} />
          </div>
        )}
      </div>
      {open && <div className="space-y-4">{children}</div>}
    </section>
  );
}

const label = "text-xs uppercase tracking-wide text-slate-500 block mb-2";
const field = "w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm";
const hex = (n: number | undefined) => "#" + (n ?? 0x5865f2).toString(16).padStart(6, "0");

// What the panel looks like in Discord (apps/bot/src/modules/community/tempChannelPanel.ts).
function PanelPreview({ value }: { value: Partial<TempChannelLobbyRow> }) {
  const games = value.gamePicker ? value.gameChoices ?? [] : [];
  const join = value.joinToCreate !== false && value.lobbyChannelId ? `<#${value.lobbyChannelId}>` : "the Create a Squad voice channel";
  const text = (value.panelText ?? "").replace(/{lobby}/g, join);
  const help = value.guideButton !== false ? <DiscordButton label="How it works" emoji="❓" /> : null;
  return (
    <DiscordMessage>
      <DiscordEmbed color={value.panelColor ?? 0x5865f2} title={value.panelTitle || "🔊 Create a Squad"} description={text} />
      {games.length ? (
        <>
          <DiscordSelect
            placeholder="🎮 Pick your game to make a squad channel"
            options={games.map((g) => ({ label: g.label || "…", emoji: g.emoji, description: g.userLimit ? `${g.userLimit}-player limit` : null }))}
          />
          {help && <DiscordButtonRow>{help}</DiscordButtonRow>}
        </>
      ) : (
        <DiscordButtonRow>
          <DiscordButton label="Create a Squad" emoji="➕" style="primary" />
          {help}
        </DiscordButtonRow>
      )}
    </DiscordMessage>
  );
}

// Step 6: the private guide behind the How it works buttons.
function GuideFields({ guildId, value, onChange, lobbyName }: { guildId: string; value: Partial<TempChannelLobbyRow>; onChange: (patch: Partial<TempChannelLobbyRow>) => void; lobbyName: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const text = value.panelGuide ?? TEMP_GUIDE_DEFAULT;
  const names = useDiscordNames(guildId);
  // Same swaps as apps/bot/src/modules/community/tempChannelGuide.ts.
  const link = (id: string | null | undefined, fallback: string) => {
    const ch = id ? names?.channels[id] : undefined;
    return ch ? `[${ch.voice ? "🔊 " : "#"}${ch.name}](https://discord.com/channels/${guildId}/${id})` : fallback;
  };
  const preview = text
    .replace(/{lobby}/g, link(value.joinToCreate !== false ? value.lobbyChannelId : null, "the Create a Squad voice channel"))
    .replace(/{panel}/g, link(value.panelChannelId, "the Create a Squad panel"))
    .replace(
      /{controls}/g,
      value.controlsWhere === "THREAD" && value.controlsChannelId
        ? `your private squad thread in ${link(value.controlsChannelId, "the squad threads channel")}, which only you are added to`
        : "your voice channel's chat (the 💬 next to the channel name)",
    )
    .replace(/<#(\d+)>/g, (m, id) => link(id, m));
  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs uppercase tracking-wide text-slate-500">Guide Text</label>
          {value.panelGuide != null && (
            <button type="button" onClick={() => onChange({ panelGuide: null })} className="text-xs text-slate-500 hover:text-neon-blue">
              Reset to the built-in guide
            </button>
          )}
        </div>
        <MarkdownToolbar guildId={guildId} textareaRef={ref} value={text} onChange={(next) => onChange({ panelGuide: next })} />
        <textarea ref={ref} rows={12} className={field + " font-mono text-xs"} maxLength={4000} value={text} onChange={(e) => onChange({ panelGuide: e.target.value })} />
        <p className="text-[11px] text-slate-500 mt-1">
          {"{lobby}"} links the Lobby Voice Channel and {"{panel}"} links the panel's channel. Edit it to match your setup, for example if you don't use
          the panel or game categories.
        </p>
      </div>
      <DiscordMessage ephemeral>
        <DiscordEmbed color={value.panelColor ?? 0x5865f2} title="❓ How Squad Channels Work" description={preview} />
      </DiscordMessage>
    </>
  );
}

// Where each squad's Lock, Rename and Limit buttons are posted.
function ControlsWhere({ guildId, value, onChange }: { guildId: string; value: Partial<TempChannelLobbyRow>; onChange: (patch: Partial<TempChannelLobbyRow>) => void }) {
  const thread = value.controlsWhere === "THREAD";
  const modes = [
    { key: "VOICE" as const, id: "voice", title: "Voice Channel Chat", desc: "In the squad channel's own chat, the 💬 next to its name. Anyone in the channel sees them." },
    { key: "THREAD" as const, id: "thread", title: "Private Thread", desc: "A private thread in a text channel you pick. Only the creator is added, and it's deleted with the squad." },
  ];
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {modes.map((m) => (
          <div
            key={m.key}
            role="button"
            tabIndex={0}
            onClick={() => onChange({ controlsWhere: m.key })}
            onKeyDown={(e) => {
              if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onChange({ controlsWhere: m.key });
              }
            }}
            aria-pressed={(value.controlsWhere ?? "VOICE") === m.key}
            className={[
              "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon-blue",
              "text-left rounded-lg border p-3 transition-colors",
              (value.controlsWhere ?? "VOICE") === m.key ? "border-neon-blue bg-neon-blue/10" : "border-white/10 bg-base-950 hover:border-white/20",
            ].join(" ")}
          >
            <p className="text-sm font-medium">{m.title}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              <EditableText id={`temp.controls.${m.id}.desc`}>{m.desc}</EditableText>
            </p>
          </div>
        ))}
      </div>
      {thread && (
        <div>
          <label className={label}>Thread Channel</label>
          <ChannelSelect guildId={guildId} kind="text" value={value.controlsChannelId ?? null} onChange={(id) => onChange({ controlsChannelId: id })} placeholder="Pick a text channel" />
          <p className="text-[11px] text-slate-500 mt-1">
            {value.controlsChannelId
              ? "Each squad gets a thread here named after it, like 🔧 🟧 R6 Squad 1. Members can be in this channel without seeing anyone else's threads."
              : "Pick a channel, or the buttons stay in the voice channel chat."}{" "}
            Spartacus needs Create Private Threads and Manage Threads there.
          </p>
        </div>
      )}
    </>
  );
}

// The full setup in steps — shared by the inline editor on an existing lobby
// (Active tab) and the fresh-draft form (Create tab), just wired to
// whichever value/onChange the caller passes in.
function LobbyFields({
  guildId,
  value,
  onChange,
  lobbyName,
}: {
  guildId: string;
  value: Partial<TempChannelLobbyRow>;
  onChange: (patch: Partial<TempChannelLobbyRow>) => void;
  lobbyName: string;
}) {
  // The panel's switch stays on while a channel is still being picked.
  const [panelOn, setPanelOn] = useState(!!value.panelChannelId);
  return (
    <div className="space-y-3">
      <Step
        id="join"
        n={1}
        title="Join to Create"
        desc="The original way in: members join this voice channel and get their own channel, then get moved into it."
        on={value.joinToCreate !== false}
        onToggle={(joinToCreate) => onChange({ joinToCreate })}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>Lobby Voice Channel</label>
            <ChannelSelect guildId={guildId} kind="voice" value={value.lobbyChannelId ?? null} onChange={(id) => onChange({ lobbyChannelId: id ?? "" })} />
          </div>
          <div>
            <label className={label}>Spawn Category</label>
            <ChannelSelect guildId={guildId} kind="category" value={value.categoryId ?? null} onChange={(id) => onChange({ categoryId: id })} />
          </div>
        </div>
      </Step>

      <Step id="settings" n={2} title="Channel Settings" desc="Every new channel starts with these, whichever way it was made.">
        <NameFormatField value={value.nameFormat ?? ""} onChange={(v) => onChange({ nameFormat: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={label}>User Limit (0 = none)</label>
            <input type="number" className={field} value={value.userLimit ?? 0} onChange={(e) => onChange({ userLimit: Number(e.target.value) })} />
          </div>
          <div>
            <label className={label}>Bitrate (bps)</label>
            <input type="number" className={field} value={value.bitrate ?? 64000} onChange={(e) => onChange({ bitrate: Number(e.target.value) })} />
          </div>
          <div>
            <label className={label}>Delete After Empty (sec)</label>
            <input type="number" className={field} value={value.deleteAfterEmptySec ?? 0} onChange={(e) => onChange({ deleteAfterEmptySec: Number(e.target.value) })} />
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-400">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!value.pairTextChannel} onChange={(e) => onChange({ pairTextChannel: e.target.checked })} />
            Pair a text channel
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!value.hideTextFromNonMembers} onChange={(e) => onChange({ hideTextFromNonMembers: e.target.checked })} />
            Hide text from non-members
          </label>
        </div>
      </Step>

      <Step id="controls" n={3} title="Controls" desc="Where each squad's Lock, Rename, Limit and game menu go.">
        <ControlsWhere guildId={guildId} value={value} onChange={onChange} />
      </Step>

      <Step
        id="gamepicker"
        n={4}
        title="Game Picker"
        desc="Let people pick their game to name the channel, like 🟧 R6 Squad 1, and set that game's limit. Off: channels keep the Name Format from step 2."
        on={!!value.gamePicker}
        onToggle={(gamePicker) => {
          // Turning the picker on with no games starts from the usual ones.
          const empty = !(value.gameChoices ?? []).length;
          onChange(gamePicker && empty ? { gamePicker, gameChoices: blueprintGameChoices(DEFAULT_BLUEPRINT_GAMES) } : { gamePicker });
        }}
      >
        <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-base-950 px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Group Squads by Game</p>
            <p className="text-xs text-slate-500">
              <EditableText id="temp.games.group.desc">
                {"Squads go in a category for their game, like 🟧 Rainbow Six Siege, so everyone can see who's playing what. The category is made with the first squad and deleted when its last squad empties. It copies the Spawn Category's access."}
              </EditableText>
            </p>
          </div>
          <ToggleSwitch enabled={!!value.gameCategories} onChange={(gameCategories) => onChange({ gameCategories })} label="Group squads by game" />
        </div>
        <GameChoicesField guildId={guildId} value={value.gameChoices ?? []} onChange={(gameChoices) => onChange({ gameChoices })} />
      </Step>

      <Step
        id="panel"
        n={5}
        on={panelOn}
        onToggle={(on) => {
          setPanelOn(on);
          if (!on) onChange({ panelChannelId: null });
        }}
        title="Create Panel"
        desc="The text channel way in: an embed with a game dropdown. Picking a game makes the voice channel, named for that game and in its category. Works alongside step 1."
      >
        <div>
          <label className={label}>Panel Channel</label>
          <ChannelSelect guildId={guildId} kind="text" value={value.panelChannelId ?? null} onChange={(id) => onChange({ panelChannelId: id })} placeholder="Pick a text channel" />
          {!value.panelChannelId && <p className="text-[11px] text-slate-500 mt-1">Pick a channel to post the panel. Turning this off deletes the posted panel.</p>}
        </div>
        {value.panelChannelId && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_7rem] gap-4">
              <div>
                <label className={label}>Title</label>
                <input className={field} maxLength={256} value={value.panelTitle ?? ""} onChange={(e) => onChange({ panelTitle: e.target.value })} />
              </div>
              <div>
                <label className={label}>Color</label>
                <input
                  type="color"
                  className="h-[42px] w-full rounded-lg border border-white/10 bg-base-950 p-1"
                  value={hex(value.panelColor)}
                  onChange={(e) => onChange({ panelColor: parseInt(e.target.value.slice(1), 16) })}
                />
              </div>
            </div>
            <div>
              <label className={label}>Description</label>
              <textarea rows={4} className={field} maxLength={4000} value={value.panelText ?? ""} onChange={(e) => onChange({ panelText: e.target.value })} />
              <p className="text-[11px] text-slate-500 mt-1">{"{lobby}"} links the Lobby Voice Channel from step 1, when Join to Create is on.</p>
            </div>
            <PanelPreview value={value} />
            <p className="text-[11px] text-slate-500">Click the dropdown in the preview to see the game list.</p>
            <p className="text-[11px] text-slate-500">
              {value.gamePicker && (value.gameChoices ?? []).length
                ? "The dropdown lists the games from step 4."
                : "With no games listed, the panel shows one Create a Squad button."}{" "}
              Someone who isn't in voice gets 2 minutes to join their new channel before it's removed. Each person can have one squad at a time.
              Changes update the posted panel a moment after you stop typing.
            </p>
          </>
        )}
      </Step>

      <Step
        id="guide"
        n={6}
        title="How It Works Guide"
        desc="A ❓ How it works button on the panel and in every squad channel. It privately shows members a step-by-step guide: both ways to make a channel, the game menu, and what each button does."
        on={value.guideButton !== false}
        onToggle={(guideButton) => onChange({ guideButton })}
      >
        <GuideFields guildId={guildId} value={value} onChange={onChange} lobbyName={lobbyName} />
      </Step>
    </div>
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

  const canCreate = draft.joinToCreate !== false ? !!draft.lobbyChannelId : !!draft.panelChannelId;

  async function createLobby() {
    if (!canCreate) return;
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
                    <LobbyFields guildId={guildId} value={l} onChange={(patch) => updateLobby(l.id, patch)} lobbyName={channelLabel(l.lobbyChannelId).replace(/^.*\/ #|^#/, "")} />
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
            <LobbyFields guildId={guildId} value={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} lobbyName={channelLabel(draft.lobbyChannelId ?? null).replace(/^.*\/ #|^#/, "")} />
          </div>
          <button onClick={createLobby} disabled={!canCreate || creating} className="neon-button disabled:opacity-50">
            {creating ? "Creating…" : "Create Lobby"}
          </button>
        </NeonCard>
      )}
    </div>
  );
}
