"use client";

import { useEffect, useRef, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { SavedEmbedPicker } from "../../../../components/embedCreator/SavedEmbedPicker";
import { PlaceholderExamples } from "../../../../components/ui/PlaceholderExamples";
import { Required } from "../../../../components/ui/Required";
import { FormError } from "../../../../components/ui/FormError";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { api, type LfgCommandRow, type LfgCommandInput } from "../../../../lib/api";

type Tab = "active" | "create";

const MESSAGE_TOKENS = [
  { token: "{user}", description: "Mentions the member who ran the command" },
  { token: "{voice}", description: "Mentions the voice channel they're currently in" },
  { token: "{message}", description: "Whatever the sender typed after the command, shown to everyone" },
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
  message: "{user} is looking for a group in {voice}! {message}",
  embedTitle: "🎮 {user} is looking for a group!",
  embedDescription: "Joining {voice} — {message}",
  embedColor: "#7B99BC",
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
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const wrongChannelRef = useRef<HTMLTextAreaElement>(null);

  return (
    <>
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
        <textarea
          ref={messageRef}
          className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm min-h-20 font-mono"
          value={value.message ?? ""}
          onChange={(e) => onChange({ message: e.target.value })}
          placeholder="{user} is looking for a group in {voice}! {message}"
        />
        <PlaceholderExamples items={MESSAGE_TOKENS} inputRef={messageRef} value={value.message ?? ""} onChange={(v) => onChange({ message: v })} />
        <p className="text-xs text-slate-600 -mt-2">
          <code className="text-slate-400">{"{message}"}</code> is whatever the sender typed after the command, shown to everyone. Used when no saved
          embed is selected above.
        </p>
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
    </>
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
        description="Members run !trigger or /trigger while in a voice channel to post an announcement pinging a role (and themselves). Each command is locked to one channel — create as many commands as you want, each with its own channel."
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
                    <p className="text-xs text-slate-500 truncate">locked to a channel · {row.roleId ? "pings a role" : "no role ping"}</p>
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
                    <LfgFields guildId={guildId} value={form} onChange={(patch) => setForm({ ...form, ...patch })} />
                    <button onClick={saveEdit} disabled={saving} className="neon-button disabled:opacity-50">
                      {saving ? "Saving…" : "Save Changes"}
                    </button>
                    <FormError message={error} />
                  </div>
                )}
              </NeonCard>
            ))}
          </div>
        ))}

      {tab === "create" && (
        <NeonCard>
          <p className="font-medium mb-3">New LFG Command</p>
          <LfgFields guildId={guildId} value={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} />
          <button onClick={createCommand} disabled={creating} className="neon-button disabled:opacity-50">
            {creating ? "Creating…" : "Create Command"}
          </button>
          <FormError message={createError} />
        </NeonCard>
      )}
    </div>
  );
}
