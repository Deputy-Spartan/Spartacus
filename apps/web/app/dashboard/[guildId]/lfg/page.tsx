"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { EmbedExtraFields } from "../../../../components/ui/EmbedExtraFields";
import { Required } from "../../../../components/ui/Required";
import { FormError } from "../../../../components/ui/FormError";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { api, type LfgCommandRow, type LfgCommandInput, type LfgMode } from "../../../../lib/api";

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
  errorMessage: "You need to be in a voice channel to use this command.",
  wrongChannelMessage: "This command can only be used in {channel}.",
};

export default function LfgPage({ params }: { params: { guildId: string } }) {
  const guildId = params.guildId;
  const confirm = useConfirm();
  const [rows, setRows] = useState<LfgCommandRow[] | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LfgCommandInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.getLfgCommands(guildId).then(setRows);
  }
  useEffect(refresh, [guildId]);

  function openNew() {
    setEditingId(null);
    setForm(EMPTY);
    setError(null);
    setShowBuilder(true);
  }
  function openEdit(row: LfgCommandRow) {
    setEditingId(row.id);
    setForm({
      trigger: row.trigger,
      description: row.description,
      channelId: row.channelId,
      roleId: row.roleId ?? "",
      includeSender: row.includeSender,
      enabled: row.enabled,
      mode: row.mode,
      message: row.message ?? EMPTY.message,
      embedTitle: row.embedTitle ?? EMPTY.embedTitle,
      embedDescription: row.embedDescription ?? EMPTY.embedDescription,
      embedColor: row.embedColor ?? EMPTY.embedColor,
      embedExtra: row.embedExtra ?? {},
      errorMessage: row.errorMessage,
      wrongChannelMessage: row.wrongChannelMessage,
    });
    setError(null);
    setShowBuilder(true);
  }

  async function save() {
    if (!form.trigger.trim()) return setError("Enter a trigger word.");
    if (!/^[a-z0-9_-]{1,32}$/.test(form.trigger.trim().toLowerCase())) {
      return setError("Trigger must be lowercase letters, numbers, - or _, 1-32 characters.");
    }
    if (!form.channelId) return setError("Pick a channel for this command.");

    setSaving(true);
    setError(null);
    try {
      const payload: LfgCommandInput = { ...form, trigger: form.trigger.trim().toLowerCase() };
      if (editingId) {
        await api.updateLfgCommand(guildId, editingId, payload);
      } else {
        await api.createLfgCommand(guildId, payload);
      }
      setShowBuilder(false);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save command");
    }
    setSaving(false);
  }

  async function remove(row: LfgCommandRow) {
    if (!(await confirm(`Delete "!${row.trigger}"? It will be removed from Discord immediately.`, { danger: true }))) return;
    await api.deleteLfgCommand(guildId, row.id);
    refresh();
  }

  function setMode(mode: LfgMode) {
    setForm((f) => ({ ...f, mode }));
  }

  return (
    <div className="space-y-4">
      <ModuleHeader
        guildId={guildId}
        moduleKey="LFG"
        title="LFG — Looking For Group"
        description="Members run !trigger or /trigger while in a voice channel to post an announcement pinging a role (and themselves). Each command is locked to one channel — create as many commands as you want, each with its own channel."
      />

      <NeonCard>
        <div className="flex items-center justify-between mb-3">
          <p className="font-medium">Your LFG Commands</p>
          <button onClick={openNew} className="neon-button-sm">
            + New LFG Command
          </button>
        </div>
        {rows === null && <p className="text-sm text-slate-500">Loading…</p>}
        {rows?.length === 0 && <p className="text-sm text-slate-500">None yet — create one to get started.</p>}
        <div className="divide-y divide-white/5">
          {rows?.map((row) => (
            <div key={row.id} className="flex items-center justify-between py-2.5 text-sm gap-3">
              <div className="min-w-0">
                <p className="text-neon-blue font-medium">
                  !{row.trigger} <span className="text-slate-600">/ /{row.trigger}</span>
                  {!row.enabled && <span className="ml-2 text-[10px] uppercase text-slate-500">Disabled</span>}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {row.mode === "embed" ? "Embed" : "Plain text"} · locked to a channel · {row.roleId ? "pings a role" : "no role ping"}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button onClick={() => openEdit(row)} className="text-slate-400 hover:text-slate-200 text-xs">
                  Edit
                </button>
                <button onClick={() => remove(row)} className="text-slate-500 hover:text-rose-400 text-xs">
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </NeonCard>

      {showBuilder && (
        <NeonCard>
          <div className="flex items-center justify-between mb-3">
            <p className="font-medium">{editingId ? "Edit LFG Command" : "New LFG Command"}</p>
            <button onClick={() => setShowBuilder(false)} className="text-slate-500 hover:text-slate-300 text-xs">
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
                Trigger word (used as !word and /word)
                <Required />
              </label>
              <input
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm font-mono"
                placeholder="lfg"
                value={form.trigger}
                onChange={(e) => setForm({ ...form, trigger: e.target.value.toLowerCase() })}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Slash command description</label>
              <input
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
              Locked Channel
              <Required />
            </label>
            <ChannelSelect
              guildId={guildId}
              value={form.channelId || null}
              onChange={(id) => setForm({ ...form, channelId: id })}
              kind="text"
              placeholder="Select a channel…"
            />
            <p className="text-xs text-slate-600 -mt-3">Only usable in this channel — no other command can share it.</p>
          </div>

          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Ping Role (optional)</label>
            <RoleSelect guildId={guildId} value={form.roleId ?? null} onChange={(id) => setForm({ ...form, roleId: id })} placeholder="No role ping" />
          </div>

          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-slate-300">Also ping the person running the command</span>
            <ToggleSwitch enabled={!!form.includeSender} onChange={(v) => setForm({ ...form, includeSender: v })} />
          </div>
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
            <span className="text-sm text-slate-300">Command enabled</span>
            <ToggleSwitch enabled={!!form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} />
          </div>

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Announcement</label>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setMode("plain")}
              className={`flex-1 rounded-lg p-2.5 text-sm border transition-colors ${
                form.mode === "plain" ? "border-neon-blue bg-base-800 shadow-glow-blue text-slate-100" : "border-white/10 bg-base-950 text-slate-400 hover:border-white/20"
              }`}
            >
              Plain text
            </button>
            <button
              onClick={() => setMode("embed")}
              className={`flex-1 rounded-lg p-2.5 text-sm border transition-colors ${
                form.mode === "embed" ? "border-neon-blue bg-base-800 shadow-glow-blue text-slate-100" : "border-white/10 bg-base-950 text-slate-400 hover:border-white/20"
              }`}
            >
              Embed
            </button>
          </div>

          {form.mode === "plain" ? (
            <div className="mb-4">
              <textarea
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm min-h-20 font-mono"
                value={form.message ?? ""}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="{user} is looking for a group in {voice}! {message}"
              />
              <p className="text-xs text-slate-600 mt-1.5">
                Tokens: <code className="text-slate-400">{"{user}"}</code> <code className="text-slate-400">{"{voice}"}</code>{" "}
                <code className="text-slate-400">{"{message}"}</code> — <code className="text-slate-400">{"{message}"}</code> is whatever the
                sender typed after the command, shown to everyone.
              </p>
            </div>
          ) : (
            <div className="mb-4 space-y-3">
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Embed Title</label>
                <input
                  className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                  value={form.embedTitle ?? ""}
                  onChange={(e) => setForm({ ...form, embedTitle: e.target.value })}
                  placeholder="🎮 {user} is looking for a group!"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Embed Description</label>
                <textarea
                  className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm min-h-20"
                  value={form.embedDescription ?? ""}
                  onChange={(e) => setForm({ ...form, embedDescription: e.target.value })}
                  placeholder="Joining {voice} — {message}"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Embed Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    className="h-9 w-12 rounded-lg border border-white/10 bg-base-950 cursor-pointer"
                    value={form.embedColor ?? "#7B99BC"}
                    onChange={(e) => setForm({ ...form, embedColor: e.target.value })}
                  />
                  <input
                    className="flex-1 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm font-mono"
                    value={form.embedColor ?? "#7B99BC"}
                    onChange={(e) => setForm({ ...form, embedColor: e.target.value })}
                  />
                </div>
              </div>
              <p className="text-xs text-slate-600">
                Tokens work in the title and description: <code className="text-slate-400">{"{user}"}</code>{" "}
                <code className="text-slate-400">{"{voice}"}</code> <code className="text-slate-400">{"{message}"}</code>
              </p>
              <EmbedExtraFields value={form.embedExtra ?? {}} onChange={(v) => setForm({ ...form, embedExtra: v })} />
            </div>
          )}

          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
              "Not in a voice channel" message (hidden — only the sender sees it)
            </label>
            <textarea
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm min-h-16"
              value={form.errorMessage ?? ""}
              onChange={(e) => setForm({ ...form, errorMessage: e.target.value })}
            />
          </div>

          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
              Wrong-channel message (hidden — shown if used outside the locked channel)
            </label>
            <textarea
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm min-h-16"
              value={form.wrongChannelMessage ?? ""}
              onChange={(e) => setForm({ ...form, wrongChannelMessage: e.target.value })}
            />
            <p className="text-xs text-slate-600 mt-1.5">
              <code className="text-slate-400">{"{channel}"}</code> inserts the locked channel's name.
            </p>
          </div>

          <button onClick={save} disabled={saving} className="neon-button disabled:opacity-50">
            {saving ? "Saving…" : editingId ? "Save Changes" : "Create Command"}
          </button>
          <FormError message={error} />
        </NeonCard>
      )}
    </div>
  );
}
