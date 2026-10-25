"use client";

import { useEffect, useRef, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { SavedEmbedPicker } from "../../../../components/embedCreator/SavedEmbedPicker";
import { PlaceholderExamples } from "../../../../components/ui/PlaceholderExamples";
import { MessageSegmentBuilder, type SegmentToken } from "../../../../components/ui/MessageSegmentBuilder";
import { Required } from "../../../../components/ui/Required";
import { FormError } from "../../../../components/ui/FormError";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { useBotAvatar } from "../../../../lib/useBotAvatar";
import { api, type LfgCommandRow, type LfgCommandInput, type LfgCategoryRow, type LfgCategoryInput, type DiscordRoleOption } from "../../../../lib/api";

type Tab = "active" | "create";

const MESSAGE_SEGMENT_TOKENS: SegmentToken[] = [
  { key: "members", label: "{members}" },
  { key: "roleTag", label: "{roleTag}" },
  { key: "voiceName", label: "{voiceName}" },
  { key: "voice", label: "{voice}" },
  { key: "user", label: "{user}" },
  { key: "message", label: "{message}" },
];

const MESSAGE_TOKEN_DOCS = [
  { token: "{members}", description: "Mentions everyone currently in that voice channel, joined with +" },
  { token: "{roleTag}", description: "The ping role, formatted as \" <-- @role\" — empty if no role is set" },
  { token: "{voiceName}", description: "The channel's name as clickable blue link text — jumps straight to it, no invite needed" },
  { token: "{voice}", description: "The voice channel's name plus a <#channel> mention instead" },
  { token: "{user}", description: "Mentions the member who ran the command" },
  { token: "{message}", description: "Whatever the sender typed after the command — shown in a code block on its own line below if you don't add this block" },
];

const WRONG_CHANNEL_TOKENS = [{ token: "{channel}", description: "Mentions the locked channel this command is restricted to" }];

const EMPTY: LfgCommandInput = {
  trigger: "",
  description: "Post that you're looking for a group.",
  channelId: "",
  roleId: "",
  includeSender: true,
  enabled: true,
  mode: "plain",
  message: "Join {members} in {voiceName}",
  embedTitle: "🎮 Looking for a Group",
  embedDescription: "{user} is queuing up in **{voice}** — join the call and hop in!\n\n{message}",
  embedColor: "#00E5FF",
  embedExtra: {},
  savedEmbedId: null,
  errorMessage: "You need to be in a voice channel to use this command.",
  wrongChannelMessage: "This command can only be used in {channel}.",
};

// The full field set — shared by the Active tab's inline editor and the
// Create tab's fresh draft, wired to whichever value/onChange the caller
// passes in.
function LfgFields({
  guildId,
  value,
  onChange,
}: {
  guildId: string;
  value: LfgCommandInput;
  onChange: (patch: Partial<LfgCommandInput>) => void;
}) {
  const wrongChannelRef = useRef<HTMLTextAreaElement>(null);
  const [roles, setRoles] = useState<DiscordRoleOption[]>([]);
  useEffect(() => {
    api.getDiscordRoles(guildId).then(setRoles);
  }, [guildId]);
  const roleLabel = roles.find((r) => r.id === value.roleId)?.name ?? null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
      <div className="min-w-0">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
            Trigger word (used as !word and /word)
            <Required />
          </label>
          <input
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm font-mono"
            placeholder="lfg"
            value={value.trigger}
            onChange={(e) => onChange({ trigger: e.target.value.toLowerCase() })}
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Slash command description</label>
          <input
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
            value={value.description}
            onChange={(e) => onChange({ description: e.target.value })}
          />
        </div>
      </div>

      <div className="mb-4">
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
          Locked Channel
          <Required />
        </label>
        <ChannelSelect guildId={guildId} value={value.channelId || null} onChange={(id) => onChange({ channelId: id ?? "" })} kind="text" placeholder="Select a channel…" />
        <p className="text-xs text-slate-600 -mt-3">Only usable in this channel — no other command can share it.</p>
      </div>

      <div className="mb-4">
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Ping Role (optional)</label>
        <RoleSelect guildId={guildId} value={value.roleId ?? null} onChange={(id) => onChange({ roleId: id })} placeholder="No role ping" />
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-slate-300">Also ping the person running the command</span>
        <ToggleSwitch enabled={!!value.includeSender} onChange={(v) => onChange({ includeSender: v })} />
      </div>
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
        <span className="text-sm text-slate-300">Command enabled</span>
        <ToggleSwitch enabled={!!value.enabled} onChange={(v) => onChange({ enabled: v })} />
      </div>

      <SavedEmbedPicker guildId={guildId} value={value.savedEmbedId ?? null} onChange={(id) => onChange({ savedEmbedId: id })} />

      <div className="mb-4">
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Announcement Message</label>
        <p className="text-xs text-slate-600 mb-2">
          Build the line from blocks — reorder with the arrows, toggle a block off to drop it, or edit the text ones. Posted as plain text, then
          followed by a real invite link to the voice channel, which Discord automatically turns into its own native card with a "Join Voice" button.
          Used when no saved embed is selected above.
        </p>
        <MessageSegmentBuilder value={value.message ?? ""} onChange={(next) => onChange({ message: next })} tokens={MESSAGE_SEGMENT_TOKENS} />
        <details className="mt-2">
          <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300">What each block means</summary>
          <ul className="mt-1.5 space-y-1">
            {MESSAGE_TOKEN_DOCS.map((t) => (
              <li key={t.token} className="text-xs text-slate-600">
                <code className="text-neon-blue">{t.token}</code> — {t.description}
              </li>
            ))}
          </ul>
        </details>
      </div>

      <div className="mb-4">
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
          "Not in a voice channel" message (hidden — only the sender sees it)
        </label>
        <textarea
          className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm min-h-16"
          value={value.errorMessage ?? ""}
          onChange={(e) => onChange({ errorMessage: e.target.value })}
        />
      </div>

      <div className="mb-4">
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
          Wrong-channel message (hidden — shown if used outside the locked channel)
        </label>
        <textarea
          ref={wrongChannelRef}
          className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm min-h-16"
          value={value.wrongChannelMessage ?? ""}
          onChange={(e) => onChange({ wrongChannelMessage: e.target.value })}
        />
        <PlaceholderExamples
          items={WRONG_CHANNEL_TOKENS}
          inputRef={wrongChannelRef}
          value={value.wrongChannelMessage ?? ""}
          onChange={(v) => onChange({ wrongChannelMessage: v })}
        />
      </div>
      </div>

      <div className="lg:sticky lg:top-4">
        <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Live preview
        </p>
        <LfgPreview template={value.message || "Join {members} in {voiceName}"} roleLabel={roleLabel} />
        <p className="text-xs text-slate-600 mt-2">
          Shows a stand-in member list and channel — the real announcement uses whoever's actually in the sender's voice channel when they run the
          command.
        </p>
      </div>
    </div>
  );
}

// Mimics Discord's own dark theme (not the dashboard's neon theme) so what
// you see here is what actually shows up in Discord — same token-splitting
// logic as the bot's own substituteLfgTokens, just rendered with styled
// spans (mention pill, blue link, fenced code block) instead of plain text.
const PREVIEW_MEMBERS = ["BustyBunz", "TT3ouls627-UBI", "Diego the Virgin"];
const PREVIEW_VOICE_NAME = "[R28] Em | Chill";
const PREVIEW_NOTE = "em+ good coms chill";

function Mention({ children }: { children: React.ReactNode }) {
  return <span className="text-[#c9cdfb] bg-[#5865f2]/30 rounded px-[2px]">{children}</span>;
}

function LfgPreview({ template, roleLabel }: { template: string; roleLabel: string | null }) {
  const avatarUrl = useBotAvatar();
  const tokenRe = /\{(members|roleTag|voiceName|voice|user|message)\}/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  let sawMessage = false;

  while ((m = tokenRe.exec(template))) {
    if (m.index > lastIndex) nodes.push(<span key={key++}>{template.slice(lastIndex, m.index)}</span>);
    const tok = m[1];
    if (tok === "members") {
      nodes.push(
        <span key={key++}>
          {PREVIEW_MEMBERS.map((n, i) => (
            <span key={i}>
              <Mention>@{n}</Mention>
              {i < PREVIEW_MEMBERS.length - 1 ? " + " : ""}
            </span>
          ))}
        </span>
      );
    } else if (tok === "roleTag") {
      if (roleLabel) {
        nodes.push(
          <span key={key++}>
            {" <-- "}
            <Mention>@{roleLabel}</Mention>
          </span>
        );
      }
    } else if (tok === "voiceName" || tok === "voice") {
      nodes.push(
        <span key={key++} className="text-[#00aff4] hover:underline cursor-pointer">
          {PREVIEW_VOICE_NAME}
        </span>
      );
    } else if (tok === "user") {
      nodes.push(<Mention key={key++}>@You</Mention>);
    } else if (tok === "message") {
      sawMessage = true;
      nodes.push(
        <pre key={key++} className="block mt-1.5 bg-[#2b2d31] rounded px-2.5 py-1.5 font-mono text-xs text-[#dbdee1] whitespace-pre-wrap">
          {PREVIEW_NOTE}
        </pre>
      );
    }
    lastIndex = tokenRe.lastIndex;
  }
  if (lastIndex < template.length) nodes.push(<span key={key++}>{template.slice(lastIndex)}</span>);

  return (
    <div className="rounded-lg bg-[#313338] p-4 font-sans">
      <div className="flex gap-3">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="h-10 w-10 shrink-0 rounded-full bg-neon-gradient flex items-center justify-center text-sm font-bold text-base-950">S</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-[#f2f3f5] font-medium text-sm">Spartacus</span>
            <span className="bg-[#5865f2] text-white text-[10px] px-1 rounded">BOT</span>
            <span className="text-[#949ba4] text-xs">Today at 9:20 PM</span>
          </div>

          <p className="text-[#dbdee1] text-sm whitespace-pre-wrap break-words mt-1 leading-relaxed">{nodes}</p>
          {!sawMessage && (
            <pre className="block mt-1.5 bg-[#2b2d31] rounded px-2.5 py-1.5 font-mono text-xs text-[#dbdee1] whitespace-pre-wrap">{PREVIEW_NOTE}</pre>
          )}

          <div className="mt-2 max-w-sm bg-[#2b2d31] rounded-lg p-2.5 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-[#f0b232] to-[#c77b1f] flex items-center justify-center text-base shrink-0">
              🔊
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[#f2f3f5] text-xs font-semibold truncate">{PREVIEW_VOICE_NAME}</p>
              <p className="text-[#949ba4] text-[11px] truncate">in your server</p>
            </div>
            <span className="shrink-0 bg-[#5865f2] text-white text-xs font-semibold px-3 py-1.5 rounded-full">Join Voice</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const EMPTY_CATEGORY: LfgCategoryInput = { name: "", roleId: null, message: null };

// Playlists/queues for one command (e.g. "Ranked", "Standard", "Custom") —
// picked from a dropdown when someone runs the slash command, each with its
// own channel and, optionally, its own role ping and announcement text.
// Only shown once the command already exists, since a category belongs to it.
function CategoriesEditor({ guildId, commandId, categories, onChange }: { guildId: string; commandId: string; categories: LfgCategoryRow[]; onChange: () => void }) {
  const [adding, setAdding] = useState<LfgCategoryInput | null>(null);
  const [editing, setEditing] = useState<{ id: string; value: LfgCategoryInput } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!adding) return;
    if (!adding.name.trim()) return setError("Enter a name for this category.");
    setBusy(true);
    setError(null);
    try {
      await api.addLfgCategory(guildId, commandId, { ...adding, name: adding.name.trim() });
      setAdding(null);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add category");
    }
    setBusy(false);
  }

  async function saveEdit() {
    if (!editing) return;
    if (!editing.value.name.trim()) return setError("Enter a name for this category.");
    setBusy(true);
    setError(null);
    try {
      await api.updateLfgCategory(guildId, commandId, editing.id, { ...editing.value, name: editing.value.name.trim() });
      setEditing(null);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save category");
    }
    setBusy(false);
  }

  async function remove(id: string) {
    setBusy(true);
    await api.deleteLfgCategory(guildId, commandId, id);
    if (editing?.id === id) setEditing(null);
    onChange();
    setBusy(false);
  }

  return (
    <div className="mb-4 pb-4 border-b border-white/5">
      <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Categories (optional)</label>
      <p className="text-xs text-slate-600 mb-3">
        Add playlists like "Ranked" or "Standard" and members pick one from a dropdown when they run the command — all post to this command's own
        channel, but each can ping its own role and use its own announcement text. Leave empty to keep this a single command with no picker.
      </p>

      <div className="space-y-2 mb-3">
        {categories.map((c) => (
          <div key={c.id} className="rounded-lg border border-white/10 bg-base-950 p-3">
            {editing?.id === c.id ? (
              <div className="space-y-2">
                <input
                  className="w-full bg-base-900 border border-white/10 rounded-lg p-2 text-sm"
                  placeholder="Ranked"
                  value={editing.value.name}
                  onChange={(e) => setEditing({ ...editing, value: { ...editing.value, name: e.target.value } })}
                />
                <RoleSelect guildId={guildId} value={editing.value.roleId ?? null} onChange={(id) => setEditing({ ...editing, value: { ...editing.value, roleId: id } })} placeholder="No role ping (use command's)" />
                <textarea
                  className="w-full bg-base-900 border border-white/10 rounded-lg p-2 text-sm min-h-16 font-mono"
                  placeholder="Leave blank to use the command's own announcement message"
                  value={editing.value.message ?? ""}
                  onChange={(e) => setEditing({ ...editing, value: { ...editing.value, message: e.target.value } })}
                />
                <div className="flex gap-2">
                  <button onClick={saveEdit} disabled={busy} className="neon-button-sm disabled:opacity-50">
                    Save
                  </button>
                  <button onClick={() => setEditing(null)} className="text-xs text-slate-500 hover:text-slate-300 px-2">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <p className="text-xs text-slate-500 truncate">{c.roleId ? "pings its own role" : "uses command's role"} · {c.message ? "custom message" : "uses command's message"}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={() => setEditing({ id: c.id, value: { name: c.name, roleId: c.roleId, message: c.message } })} className="text-xs text-slate-500 hover:text-neon-blue">
                    Edit
                  </button>
                  <button onClick={() => remove(c.id)} disabled={busy} className="text-xs text-slate-500 hover:text-rose-400">
                    Remove
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {categories.length === 0 && !adding && <p className="text-xs text-slate-600">No categories — this command posts straight to its own channel.</p>}
      </div>

      {adding ? (
        <div className="rounded-lg border border-white/10 bg-base-950 p-3 space-y-2">
          <input
            className="w-full bg-base-900 border border-white/10 rounded-lg p-2 text-sm"
            placeholder="Category name, e.g. Ranked"
            value={adding.name}
            onChange={(e) => setAdding({ ...adding, name: e.target.value })}
          />
          <RoleSelect guildId={guildId} value={adding.roleId ?? null} onChange={(id) => setAdding({ ...adding, roleId: id })} placeholder="No role ping (use command's)" />
          <textarea
            className="w-full bg-base-900 border border-white/10 rounded-lg p-2 text-sm min-h-16 font-mono"
            placeholder="Leave blank to use the command's own announcement message"
            value={adding.message ?? ""}
            onChange={(e) => setAdding({ ...adding, message: e.target.value })}
          />
          <div className="flex gap-2">
            <button onClick={add} disabled={busy} className="neon-button-sm disabled:opacity-50">
              Add Category
            </button>
            <button
              onClick={() => {
                setAdding(null);
                setError(null);
              }}
              className="text-xs text-slate-500 hover:text-slate-300 px-2"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(EMPTY_CATEGORY)} className="text-xs text-neon-blue hover:text-neon-purple">
          + Add Category
        </button>
      )}
      <FormError message={error} />
    </div>
  );
}

export default function LfgPage({ params }: { params: { guildId: string } }) {
  const guildId = params.guildId;
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("active");
  const [rows, setRows] = useState<LfgCommandRow[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LfgCommandInput>(EMPTY);
  const [draft, setDraft] = useState<LfgCommandInput>(EMPTY);
  const [draftKey, setDraftKey] = useState(0); // bumped on every fresh draft so the message builder's blocks reset too
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  function refresh() {
    api.getLfgCommands(guildId).then(setRows);
  }
  useEffect(refresh, [guildId]);

  function openEdit(row: LfgCommandRow) {
    setEditingId(row.id);
    setForm({
      trigger: row.trigger,
      description: row.description,
      channelId: row.channelId,
      roleId: row.roleId ?? "",
      includeSender: row.includeSender,
      enabled: row.enabled,
      mode: "plain",
      message: row.message ?? EMPTY.message,
      embedTitle: row.embedTitle ?? EMPTY.embedTitle,
      embedDescription: row.embedDescription ?? EMPTY.embedDescription,
      embedColor: row.embedColor ?? EMPTY.embedColor,
      embedExtra: row.embedExtra ?? {},
      savedEmbedId: row.savedEmbedId ?? null,
      errorMessage: row.errorMessage,
      wrongChannelMessage: row.wrongChannelMessage,
    });
    setError(null);
  }

  function validate(input: LfgCommandInput): string | null {
    if (!input.trigger.trim()) return "Enter a trigger word.";
    if (!/^[a-z0-9_-]{1,32}$/.test(input.trigger.trim().toLowerCase())) {
      return "Trigger must be lowercase letters, numbers, - or _, 1-32 characters.";
    }
    if (!input.channelId) return "Pick a channel for this command.";
    return null;
  }

  async function saveEdit() {
    const validationError = validate(form);
    if (validationError) return setError(validationError);
    if (!editingId) return;

    setSaving(true);
    setError(null);
    try {
      const payload: LfgCommandInput = { ...form, trigger: form.trigger.trim().toLowerCase(), mode: "plain" };
      await api.updateLfgCommand(guildId, editingId, payload);
      setEditingId(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save command");
    }
    setSaving(false);
  }

  async function createCommand() {
    const validationError = validate(draft);
    if (validationError) return setCreateError(validationError);

    setCreating(true);
    setCreateError(null);
    try {
      const payload: LfgCommandInput = { ...draft, trigger: draft.trigger.trim().toLowerCase(), mode: "plain" };
      await api.createLfgCommand(guildId, payload);
      setDraft(EMPTY);
      setDraftKey((k) => k + 1);
      setTab("active");
      refresh();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create command");
    }
    setCreating(false);
  }

  async function remove(row: LfgCommandRow) {
    if (!(await confirm(`Delete "!${row.trigger}"? It will be removed from Discord immediately.`, { danger: true }))) return;
    await api.deleteLfgCommand(guildId, row.id);
    if (editingId === row.id) setEditingId(null);
    refresh();
  }

  return (
    <div>
      <ModuleHeader
        guildId={guildId}
        moduleKey="LFG"
        title="LFG — Looking For Group"
        description="Members run !trigger or /trigger while in a voice channel to post an announcement pinging a role (and themselves). Each command is locked to one channel — create as many commands as you want, each with its own channel. Add categories to one command to let members pick a playlist (e.g. Ranked vs. Standard) that posts to its own channel and role."
      />

      <div className="flex gap-1 mb-5 border-b border-white/5">
        <button
          onClick={() => setTab("active")}
          className={[
            "px-4 py-2 text-sm border-b-2 transition-colors",
            tab === "active" ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
          ].join(" ")}
        >
          Active Commands
        </button>
        <button
          onClick={() => {
            setDraft(EMPTY);
            setDraftKey((k) => k + 1);
            setCreateError(null);
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
        (rows === null ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : rows.length === 0 ? (
          <NeonCard>
            <div className="text-center py-10">
              <p className="text-sm text-slate-400 mb-1">No LFG commands yet.</p>
              <p className="text-xs text-slate-600 mb-4">Create one to let members announce they're looking for a group.</p>
              <button onClick={() => setTab("create")} className="neon-button-sm">
                + Create New
              </button>
            </div>
          </NeonCard>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <NeonCard key={row.id}>
                <div className="flex items-center justify-between gap-3">
                  <button className="min-w-0 flex-1 text-left" onClick={() => (editingId === row.id ? setEditingId(null) : openEdit(row))}>
                    <p className="text-neon-blue font-medium">
                      !{row.trigger} <span className="text-slate-600">/ /{row.trigger}</span>
                      {!row.enabled && <span className="ml-2 text-[10px] uppercase text-slate-500">Disabled</span>}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      locked to a channel · {row.roleId ? "pings a role" : "no role ping"}
                      {row.categories.length > 0 ? ` · ${row.categories.length} categor${row.categories.length === 1 ? "y" : "ies"}` : ""}
                    </p>
                  </button>
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={() => (editingId === row.id ? setEditingId(null) : openEdit(row))} className="text-xs text-slate-500 hover:text-neon-blue">
                      {editingId === row.id ? "Close" : "Edit"}
                    </button>
                    <button onClick={() => remove(row)} className="text-xs text-slate-500 hover:text-rose-400">
                      Remove
                    </button>
                  </div>
                </div>

                {editingId === row.id && (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <LfgFields key={editingId} guildId={guildId} value={form} onChange={(patch) => setForm({ ...form, ...patch })} />
                    <button onClick={saveEdit} disabled={saving} className="neon-button disabled:opacity-50 mb-4">
                      {saving ? "Saving…" : "Save Changes"}
                    </button>
                    <FormError message={error} />
                    <CategoriesEditor guildId={guildId} commandId={row.id} categories={row.categories} onChange={refresh} />
                  </div>
                )}
              </NeonCard>
            ))}
          </div>
        ))}

      {tab === "create" && (
        <NeonCard>
          <p className="font-medium mb-3">New LFG Command</p>
          <LfgFields key={draftKey} guildId={guildId} value={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} />
          <button onClick={createCommand} disabled={creating} className="neon-button disabled:opacity-50">
            {creating ? "Creating…" : "Create Command"}
          </button>
          <FormError message={createError} />
        </NeonCard>
      )}
    </div>
  );
}
