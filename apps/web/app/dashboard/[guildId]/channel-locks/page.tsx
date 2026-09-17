"use client";

import { useEffect, useRef, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { PlaceholderExamples } from "../../../../components/ui/PlaceholderExamples";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { Required } from "../../../../components/ui/Required";
import { FormError } from "../../../../components/ui/FormError";
import { api, type ChannelLockInput, type ChannelLockRow, type DiscordChannelOption, type DiscordRoleOption } from "../../../../lib/api";

const NOTIFY_TOKENS = [
  { token: "{user}", description: "Mentions the member whose message was removed" },
  { token: "{channel}", description: "Mentions the channel the message was removed from" },
];

const EMPTY_FORM: ChannelLockInput = {
  allowImages: true,
  allowLinks: true,
  allowFiles: true,
  allowMessages: true,
  slashCommandsOnly: false,
  allowedCommands: [],
  requiredPrefixes: [],
  bannedWords: [],
  allowedUserIds: [],
  allowedRoleIds: [],
  notifyEnabled: false,
  notifyContent: "{user}, that message isn't allowed in {channel}.",
};

function Row({ label, hint, enabled, onChange }: { label: string; hint: string; enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-b-0">
      <div>
        <p className="text-sm text-slate-200">{label}</p>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
      <ToggleSwitch enabled={enabled} onChange={onChange} label={label} />
    </div>
  );
}

function AllowedRolesPicker({ guildId, value, onChange }: { guildId: string; value: string[]; onChange: (ids: string[]) => void }) {
  const [roles, setRoles] = useState<DiscordRoleOption[]>([]);
  useEffect(() => {
    api.getDiscordRoles(guildId).then(setRoles);
  }, [guildId]);
  const available = roles.filter((r) => !value.includes(r.id));

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {value.map((id) => {
          const role = roles.find((r) => r.id === id);
          return (
            <span key={id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-base-800 border border-white/10 text-slate-300">
              @{role?.name ?? id}
              <button type="button" onClick={() => onChange(value.filter((v) => v !== id))} className="text-slate-500 hover:text-neon-blue">
                ×
              </button>
            </span>
          );
        })}
        {value.length === 0 && <span className="text-xs text-slate-500">None selected.</span>}
      </div>
      <select
        className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
        value=""
        onChange={(e) => {
          if (e.target.value) onChange([...value, e.target.value]);
        }}
      >
        <option value="">Add a role…</option>
        {available.map((r) => (
          <option key={r.id} value={r.id}>
            @{r.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function TagList({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const v = draft.trim();
    if (!v || values.includes(v)) return;
    onChange([...values, v]);
    setDraft("");
  }

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input
          className="flex-1 bg-base-950 border border-white/10 rounded-lg p-2 text-sm"
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button onClick={add} className="neon-button-sm">
          Add
        </button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span key={v} className="flex items-center gap-1 bg-base-800 border border-white/10 rounded-full px-2.5 py-1 text-xs">
              {v}
              <button onClick={() => onChange(values.filter((x) => x !== v))} className="text-slate-500 hover:text-rose-400">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChannelLocksPage({ params }: { params: { guildId: string } }) {
  const confirm = useConfirm();
  const notifyContentRef = useRef<HTMLTextAreaElement>(null);
  const [rows, setRows] = useState<ChannelLockRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [form, setForm] = useState<ChannelLockInput>(EMPTY_FORM);
  const [showEditor, setShowEditor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channelOptions, setChannelOptions] = useState<DiscordChannelOption[]>([]);

  function refresh() {
    api.getChannelLocks(params.guildId).then(setRows);
  }
  useEffect(refresh, [params.guildId]);
  useEffect(() => {
    api.getDiscordChannels(params.guildId).then((r) => setChannelOptions([...r.textChannels, ...r.voiceChannels]));
  }, [params.guildId]);

  function channelLabel(id: string): string {
    const ch = channelOptions.find((c) => c.id === id);
    if (!ch) return `#${id}`;
    return ch.categoryName ? `${ch.categoryName} / #${ch.name}` : `#${ch.name}`;
  }

  function startCreate() {
    setEditingId(null);
    setChannelId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowEditor(true);
  }

  function startEdit(row: ChannelLockRow) {
    setEditingId(row.id);
    setChannelId(row.channelId);
    setForm({
      allowImages: row.allowImages,
      allowLinks: row.allowLinks,
      allowFiles: row.allowFiles,
      allowMessages: row.allowMessages,
      slashCommandsOnly: row.slashCommandsOnly,
      allowedCommands: row.allowedCommands,
      requiredPrefixes: row.requiredPrefixes,
      bannedWords: row.bannedWords,
      allowedUserIds: row.allowedUserIds,
      allowedRoleIds: row.allowedRoleIds,
      notifyEnabled: row.notifyEnabled,
      notifyContent: row.notifyContent ?? "{user}, that message isn't allowed in {channel}.",
    });
    setError(null);
    setShowEditor(true);
  }

  async function save() {
    if (!channelId) {
      setError("Select a channel before saving.");
      return;
    }
    setError(null);
    if (editingId) {
      await api.updateChannelLock(params.guildId, editingId, form);
    } else {
      await api.addChannelLock(params.guildId, channelId, form);
    }
    setShowEditor(false);
    refresh();
  }

  async function remove(id: string) {
    if (!(await confirm("Delete this channel lock schedule?"))) return;
    await api.deleteChannelLock(params.guildId, id);
    if (editingId === id) setShowEditor(false);
    refresh();
  }

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="CHANNEL_LOCKS"
        title="Channel Locks"
        description="Restrict a channel to only certain kinds of content — images, links, files, or messages starting with a required word."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <NeonCard>
          <div className="flex items-center justify-between mb-3">
            <p className="font-medium">Locked Channels</p>
            <button onClick={startCreate} className="neon-button-sm">
              + New Lock
            </button>
          </div>
          {rows.length === 0 && <p className="text-sm text-slate-500">None yet.</p>}
          <div className="divide-y divide-white/5">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2.5 text-sm gap-3">
                <div className="min-w-0">
                  <span className="text-slate-300 truncate block">{channelLabel(r.channelId)}</span>
                  <span className="text-slate-600 text-xs">
                    {r.slashCommandsOnly
                      ? r.allowedCommands.length > 0
                        ? `Slash commands only (${r.allowedCommands.length} allowed)`
                        : "Slash commands only"
                      : [
                          !r.allowImages && "no images",
                          !r.allowLinks && "no links",
                          !r.allowFiles && "no files",
                          !r.allowMessages && r.requiredPrefixes.length === 0 && "no plain text",
                          r.requiredPrefixes.length > 0 && `prefix required`,
                          r.bannedWords.length > 0 && `${r.bannedWords.length} banned word(s)`,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "no restrictions"}
                    {r.allowedUserIds.length + r.allowedRoleIds.length > 0 ? ` · restricted to ${r.allowedUserIds.length + r.allowedRoleIds.length} sender(s)` : ""}
                    {r.notifyEnabled ? " · notifies on delete" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={() => startEdit(r)} className="text-slate-500 hover:text-neon-blue text-xs">
                    Edit
                  </button>
                  <button onClick={() => remove(r.id)} className="text-slate-500 hover:text-rose-400 text-xs">
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </NeonCard>

        {showEditor && (
          <NeonCard>
            <div className="flex items-center justify-between mb-3">
              <p className="font-medium">{editingId ? "Edit Lock" : "New Lock"}</p>
              <button onClick={() => setShowEditor(false)} className="text-slate-500 hover:text-slate-300 text-xs">
                Close
              </button>
            </div>

            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
              Channel
              <Required />
            </label>
            <ChannelSelect
              guildId={params.guildId}
              value={channelId}
              onChange={setChannelId}
              kind="text"
              placeholder={editingId ? undefined : "Select a channel…"}
            />
            {editingId && <p className="text-xs text-slate-600 -mt-3 mb-4">Locked to {channelLabel(channelId ?? "")} — channel can't be changed once created.</p>}

            <div className="mb-4">
              <Row
                label="Slash commands only"
                hint="Deletes every regular message — only interactions (slash commands, buttons) go untouched."
                enabled={form.slashCommandsOnly}
                onChange={(v) => setForm({ ...form, slashCommandsOnly: v })}
              />
              {form.slashCommandsOnly && (
                <div className="pt-3">
                  <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Restrict to Specific Commands (optional)</label>
                  <TagList
                    values={form.allowedCommands}
                    onChange={(v) => setForm({ ...form, allowedCommands: v })}
                    placeholder="e.g. ticket (no slash)"
                  />
                  <p className="text-xs text-slate-600 mt-1">
                    Leave empty to allow every slash command. Add one or more to refuse everything else with an ephemeral error before it runs.
                  </p>
                </div>
              )}
              {!form.slashCommandsOnly && (
                <>
                  <Row
                    label="Allow images"
                    hint="Image attachments"
                    enabled={form.allowImages}
                    onChange={(v) => setForm({ ...form, allowImages: v })}
                  />
                  <Row
                    label="Allow links"
                    hint="Messages containing a URL"
                    enabled={form.allowLinks}
                    onChange={(v) => setForm({ ...form, allowLinks: v })}
                  />
                  <Row
                    label="Allow files"
                    hint="Non-image attachments"
                    enabled={form.allowFiles}
                    onChange={(v) => setForm({ ...form, allowFiles: v })}
                  />
                  <Row
                    label="Allow plain messages"
                    hint="Text with no link/attachment — ignored if a required prefix is set below"
                    enabled={form.allowMessages}
                    onChange={(v) => setForm({ ...form, allowMessages: v })}
                  />
                </>
              )}
            </div>

            {!form.slashCommandsOnly && (
              <>
                <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
                  Required Prefixes (message must start with one)
                </label>
                <div className="mb-4">
                  <TagList
                    values={form.requiredPrefixes}
                    onChange={(v) => setForm({ ...form, requiredPrefixes: v })}
                    placeholder="e.g. !suggest"
                  />
                </div>

                <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Banned Words</label>
                <div className="mb-4">
                  <TagList
                    values={form.bannedWords}
                    onChange={(v) => setForm({ ...form, bannedWords: v })}
                    placeholder="Word to always delete"
                  />
                </div>
              </>
            )}

            <div className="pt-4 border-t border-white/5 mb-4">
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Restrict Who Can Post Here (optional)</label>
              <p className="text-xs text-slate-600 mb-2">
                Leave both empty to allow anyone the rules above allow. Add a role or user/bot ID and only they can post — everyone else gets deleted
                immediately, before any other rule is even checked.
              </p>
              <div className="mb-3">
                <p className="text-xs text-slate-500 mb-1">Allowed Roles</p>
                <AllowedRolesPicker guildId={params.guildId} value={form.allowedRoleIds} onChange={(v) => setForm({ ...form, allowedRoleIds: v })} />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Allowed Users / Bots (paste an ID)</p>
                <TagList values={form.allowedUserIds} onChange={(v) => setForm({ ...form, allowedUserIds: v })} placeholder="Right-click → Copy ID" />
              </div>
            </div>

            <div className="pt-4 border-t border-white/5 mb-4">
              <Row
                label="Notify on delete"
                hint="Posts a button when a message is removed — clicking it reveals your message below as a real Discord ephemeral reply, visible only to the member who clicked."
                enabled={form.notifyEnabled}
                onChange={(v) => setForm({ ...form, notifyEnabled: v })}
              />
              {form.notifyEnabled && (
                <div className="pt-3">
                  <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Notice Message</label>
                  <textarea
                    ref={notifyContentRef}
                    className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                    rows={2}
                    value={form.notifyContent ?? ""}
                    onChange={(e) => setForm({ ...form, notifyContent: e.target.value })}
                  />
                  <PlaceholderExamples
                    items={NOTIFY_TOKENS}
                    inputRef={notifyContentRef}
                    value={form.notifyContent ?? ""}
                    onChange={(v) => setForm({ ...form, notifyContent: v })}
                  />
                </div>
              )}
            </div>

            <button onClick={save} className="neon-button">
              {editingId ? "Save Changes" : "Create Lock"}
            </button>
            <FormError message={error} />
          </NeonCard>
        )}
      </div>
    </div>
  );
}
