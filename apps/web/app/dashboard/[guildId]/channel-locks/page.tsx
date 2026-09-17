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

type Tab = "active" | "create";

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

function LockFields({
  guildId,
  channelId,
  onChannelChange,
  channelLabel,
  channelLocked,
  value,
  onChange,
}: {
  guildId: string;
  channelId: string | null;
  onChannelChange: (id: string | null) => void;
  channelLabel: (id: string) => string;
  channelLocked: boolean;
  value: ChannelLockInput;
  onChange: (patch: Partial<ChannelLockInput>) => void;
}) {
  const notifyContentRef = useRef<HTMLTextAreaElement>(null);

  return (
    <>
      <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
        Channel
        {!channelLocked && <Required />}
      </label>
      {channelLocked ? (
        <p className="text-xs text-slate-600 mb-4">Locked to {channelLabel(channelId ?? "")} — channel can't be changed once created.</p>
      ) : (
        <ChannelSelect guildId={guildId} value={channelId} onChange={onChannelChange} kind="text" placeholder="Select a channel…" />
      )}

      <div className="mb-4">
        <Row
          label="Slash commands only"
          hint="Deletes every regular message — only interactions (slash commands, buttons) go untouched."
          enabled={value.slashCommandsOnly}
          onChange={(v) => onChange({ slashCommandsOnly: v })}
        />
        {value.slashCommandsOnly && (
          <div className="pt-3">
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Restrict to Specific Commands (optional)</label>
            <TagList values={value.allowedCommands} onChange={(v) => onChange({ allowedCommands: v })} placeholder="e.g. ticket (no slash)" />
            <p className="text-xs text-slate-600 mt-1">
              Leave empty to allow every slash command. Add one or more to refuse everything else with an ephemeral error before it runs.
            </p>
          </div>
        )}
        {!value.slashCommandsOnly && (
          <>
            <Row label="Allow images" hint="Image attachments" enabled={value.allowImages} onChange={(v) => onChange({ allowImages: v })} />
            <Row label="Allow links" hint="Messages containing a URL" enabled={value.allowLinks} onChange={(v) => onChange({ allowLinks: v })} />
            <Row label="Allow files" hint="Non-image attachments" enabled={value.allowFiles} onChange={(v) => onChange({ allowFiles: v })} />
            <Row
              label="Allow plain messages"
              hint="Text with no link/attachment — ignored if a required prefix is set below"
              enabled={value.allowMessages}
              onChange={(v) => onChange({ allowMessages: v })}
            />
          </>
        )}
      </div>

      {!value.slashCommandsOnly && (
        <>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Required Prefixes (message must start with one)</label>
          <div className="mb-4">
            <TagList values={value.requiredPrefixes} onChange={(v) => onChange({ requiredPrefixes: v })} placeholder="e.g. !suggest" />
          </div>

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Banned Words</label>
          <div className="mb-4">
            <TagList values={value.bannedWords} onChange={(v) => onChange({ bannedWords: v })} placeholder="Word to always delete" />
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
          <AllowedRolesPicker guildId={guildId} value={value.allowedRoleIds} onChange={(v) => onChange({ allowedRoleIds: v })} />
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Allowed Users / Bots (paste an ID)</p>
          <TagList values={value.allowedUserIds} onChange={(v) => onChange({ allowedUserIds: v })} placeholder="Right-click → Copy ID" />
        </div>
      </div>

      <div className="pt-4 border-t border-white/5 mb-4">
        <Row
          label="Notify on delete"
          hint="Posts a button when a message is removed — clicking it reveals your message below as a real Discord ephemeral reply, visible only to the member who clicked."
          enabled={value.notifyEnabled}
          onChange={(v) => onChange({ notifyEnabled: v })}
        />
        {value.notifyEnabled && (
          <div className="pt-3">
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Notice Message</label>
            <textarea
              ref={notifyContentRef}
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
              rows={2}
              value={value.notifyContent ?? ""}
              onChange={(e) => onChange({ notifyContent: e.target.value })}
            />
            <PlaceholderExamples items={NOTIFY_TOKENS} inputRef={notifyContentRef} value={value.notifyContent ?? ""} onChange={(v) => onChange({ notifyContent: v })} />
          </div>
        )}
      </div>
    </>
  );
}

export default function ChannelLocksPage({ params }: { params: { guildId: string } }) {
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("active");
  const [rows, setRows] = useState<ChannelLockRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [form, setForm] = useState<ChannelLockInput>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [draftChannelId, setDraftChannelId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ChannelLockInput>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
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

  function openEdit(row: ChannelLockRow) {
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
  }

  async function saveEdit() {
    if (!editingId) return;
    setError(null);
    await api.updateChannelLock(params.guildId, editingId, form);
    setEditingId(null);
    refresh();
  }

  function resetDraft() {
    setDraftChannelId(null);
    setDraft(EMPTY_FORM);
    setCreateError(null);
  }

  async function createLock() {
    if (!draftChannelId) {
      setCreateError("Select a channel before saving.");
      return;
    }
    setCreateError(null);
    setCreating(true);
    try {
      await api.addChannelLock(params.guildId, draftChannelId, draft);
      resetDraft();
      setTab("active");
      refresh();
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: string) {
    if (!(await confirm("Delete this channel lock schedule?"))) return;
    await api.deleteChannelLock(params.guildId, id);
    if (editingId === id) setEditingId(null);
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

      <div className="flex gap-1 mb-5 border-b border-white/5">
        <button
          onClick={() => setTab("active")}
          className={[
            "px-4 py-2 text-sm border-b-2 transition-colors",
            tab === "active" ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
          ].join(" ")}
        >
          Locked Channels
        </button>
        <button
          onClick={() => {
            resetDraft();
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
        (rows.length === 0 ? (
          <NeonCard>
            <div className="text-center py-10">
              <p className="text-sm text-slate-400 mb-1">No channel locks yet.</p>
              <p className="text-xs text-slate-600 mb-4">Create one to restrict what can be posted in a channel.</p>
              <button onClick={() => setTab("create")} className="neon-button-sm">
                + Create New
              </button>
            </div>
          </NeonCard>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <NeonCard key={r.id}>
                <div className="flex items-center justify-between gap-3">
                  <button className="min-w-0 flex-1 text-left" onClick={() => (editingId === r.id ? setEditingId(null) : openEdit(r))}>
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
                      {r.allowedUserIds.length + r.allowedRoleIds.length > 0
                        ? ` · restricted to ${r.allowedUserIds.length + r.allowedRoleIds.length} sender(s)`
                        : ""}
                      {r.notifyEnabled ? " · notifies on delete" : ""}
                    </span>
                  </button>
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={() => (editingId === r.id ? setEditingId(null) : openEdit(r))} className="text-xs text-slate-500 hover:text-neon-blue">
                      {editingId === r.id ? "Close" : "Edit"}
                    </button>
                    <button onClick={() => remove(r.id)} className="text-xs text-slate-500 hover:text-rose-400">
                      Remove
                    </button>
                  </div>
                </div>

                {editingId === r.id && (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <LockFields
                      guildId={params.guildId}
                      channelId={channelId}
                      onChannelChange={setChannelId}
                      channelLabel={channelLabel}
                      channelLocked
                      value={form}
                      onChange={(patch) => setForm({ ...form, ...patch })}
                    />
                    <button onClick={saveEdit} className="neon-button">
                      Save Changes
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
          <p className="font-medium mb-3">New Lock</p>
          <LockFields
            guildId={params.guildId}
            channelId={draftChannelId}
            onChannelChange={setDraftChannelId}
            channelLabel={channelLabel}
            channelLocked={false}
            value={draft}
            onChange={(patch) => setDraft({ ...draft, ...patch })}
          />
          <button onClick={createLock} disabled={creating} className="neon-button disabled:opacity-50">
            {creating ? "Creating…" : "Create Lock"}
          </button>
          <FormError message={createError} />
        </NeonCard>
      )}
    </div>
  );
}
