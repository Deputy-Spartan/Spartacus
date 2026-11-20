"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { ModuleMessage, designFrom } from "../../../../components/embedCreator/ModuleMessage";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { Required } from "../../../../components/ui/Required";
import { FormError } from "../../../../components/ui/FormError";
import { useDiscordNames } from "../../../../components/ui/DiscordMarkdown";
import { api, type StickyMessageInput, type StickyMessageRow } from "../../../../lib/api";

type Tab = "active" | "create";

const EMPTY_FORM: StickyMessageInput = {
  label: "",
  content: "",
  embedEnabled: false,
  embedTitle: "",
  embedDescription: "",
  embedColor: "#5865F2",
  buttons: [],
  embedExtra: {},
  savedEmbedId: null,
};

// A saved embed is a whole message by itself, so the text is optional then.
function hasMessage(f: StickyMessageInput) {
  return !!f.savedEmbedId || !!f.content.trim() || !!f.embedTitle?.trim() || !!f.embedDescription?.trim();
}

// The full field set — shared by the Active tab's inline editor and the
// Create tab's fresh draft, wired to whichever value/onChange the caller
// passes in.
function StickyFields({
  guildId,
  channelId,
  onChannelChange,
  channelLocked,
  ownKey,
  form,
  onChange,
}: {
  guildId: string;
  channelId: string | null;
  onChannelChange: (id: string | null) => void;
  channelLocked: boolean;
  ownKey: string;
  form: StickyMessageInput;
  onChange: (patch: Partial<StickyMessageInput>) => void;
}) {
  return (
    <>
      <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
        Channel
        <Required />
      </label>
      <ChannelSelect
        guildId={guildId}
        value={channelId}
        onChange={onChannelChange}
        kind="text"
        placeholder={channelLocked ? undefined : "Select a channel…"}
      />
      {channelLocked && <p className="text-xs text-slate-600 -mt-3 mb-4">Channel can't be changed once created.</p>}

      <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Name</label>
      <input
        className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
        value={form.label ?? ""}
        maxLength={80}
        placeholder="e.g. R6 stats command"
        onChange={(e) => onChange({ label: e.target.value })}
      />
      <p className="text-xs text-slate-600 mt-1 mb-4">Only shows here in the list. It's never posted in Discord.</p>

      <ModuleMessage
        key={ownKey}
        guildId={guildId}
        title="Sticky message"
        description="Reposted at the bottom of the channel after new messages."
        ownerKey={`sticky:${ownKey}`}
        savedEmbedId={form.savedEmbedId ?? null}
        onSavedEmbedChange={(id) => onChange({ savedEmbedId: id })}
        seed={() =>
          form.embedEnabled
            ? designFrom({
                content: form.content,
                title: form.embedTitle,
                description: form.embedDescription,
                color: form.embedColor,
                extra: form.embedExtra,
                links: form.buttons,
              })
            : designFrom({ content: form.content, links: form.buttons })
        }
      />
    </>
  );
}

export default function StickyMessagesPage({ params }: { params: { guildId: string } }) {
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("active");
  const [rows, setRows] = useState<StickyMessageRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [form, setForm] = useState<StickyMessageInput>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const [draftChannelId, setDraftChannelId] = useState<string | null>(null);
  const [draft, setDraft] = useState<StickyMessageInput>(EMPTY_FORM);
  // Names a new sticky's own embed until it's saved.
  const [draftKey, setDraftKey] = useState(() => `new-${Date.now().toString(36)}`);
  const [createError, setCreateError] = useState<string | null>(null);

  function refresh() {
    api.getStickyMessages(params.guildId).then(setRows);
  }
  useEffect(refresh, [params.guildId]);
  const [embedNames, setEmbedNames] = useState<Record<string, string>>({});
  useEffect(() => {
    api
      .getSavedEmbeds(params.guildId)
      .then((list) => setEmbedNames(Object.fromEntries(list.map((e) => [e.id, e.name]))))
      .catch(() => null);
  }, [params.guildId]);
  const channelNames = useDiscordNames(params.guildId)?.channels ?? {};
  // What a sticky is called in the list: its name, else whatever best describes it.
  const titleOf = (r: StickyMessageRow) =>
    r.label?.trim() ||
    r.embedTitle?.trim() ||
    (r.savedEmbedId && embedNames[r.savedEmbedId] ? `Saved embed: ${embedNames[r.savedEmbedId]}` : "") ||
    r.content.replace(/[#*_`>~|]/g, "").trim() ||
    "Untitled sticky";

  function resetDraft() {
    setDraftChannelId(null);
    setDraft(EMPTY_FORM);
    setDraftKey(`new-${Date.now().toString(36)}`);
    setCreateError(null);
  }

  function openEdit(row: StickyMessageRow) {
    setEditingId(row.id);
    setChannelId(row.channelId);
    setForm({
      label: row.label ?? "",
      content: row.content,
      embedEnabled: row.embedEnabled,
      embedTitle: row.embedTitle ?? "",
      embedDescription: row.embedDescription ?? "",
      embedColor: row.embedColor ?? "#5865F2",
      buttons: row.buttons,
      embedExtra: row.embedExtra ?? {},
      savedEmbedId: row.savedEmbedId ?? null,
    });
    setError(null);
  }

  async function saveEdit() {
    if (!editingId) return;
    if (!hasMessage(form)) {
      setError("Write a message or pick a saved embed before saving.");
      return;
    }
    setError(null);
    await api.updateStickyMessage(params.guildId, editingId, form);
    setEditingId(null);
    refresh();
  }

  async function create() {
    if (!draftChannelId || !hasMessage(draft)) {
      setCreateError("Select a channel, then write a message or pick a saved embed.");
      return;
    }
    setCreateError(null);
    await api.addStickyMessage(params.guildId, draftChannelId, draft);
    resetDraft();
    setTab("active");
    refresh();
  }

  async function remove(id: string) {
    if (!(await confirm("Delete this sticky message?"))) return;
    await api.deleteStickyMessage(params.guildId, id);
    if (editingId === id) setEditingId(null);
    refresh();
  }

  const [resendingId, setResendingId] = useState<string | null>(null);
  async function resend(id: string) {
    setResendingId(id);
    await api.resendStickyMessage(params.guildId, id).catch(() => null);
    setResendingId(null);
  }

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="STICKY_MESSAGES"
        title="Sticky Messages"
        description="The bot reposts this message to the bottom of the channel every time someone else sends a message there."
      />

      <div className="flex gap-1 mb-5 border-b border-white/5">
        <button
          onClick={() => setTab("active")}
          className={[
            "px-4 py-2 text-sm border-b-2 transition-colors",
            tab === "active" ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
          ].join(" ")}
        >
          Active Stickies
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
              <p className="text-sm text-slate-400 mb-1">No sticky messages yet.</p>
              <p className="text-xs text-slate-600 mb-4">Create one to keep a message pinned to the bottom of a channel.</p>
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
                    <span className="text-slate-300 truncate block">{titleOf(r)}</span>
                    <span className="text-slate-600 text-xs">
                      {[
                        channelNames[r.channelId] ? `#${channelNames[r.channelId].name}` : null,
                        r.savedEmbedId ? "Saved embed" : r.embedEnabled ? "Embed" : "Text",
                        r.buttons.length > 0 ? `${r.buttons.length} button${r.buttons.length === 1 ? "" : "s"}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={() => resend(r.id)} disabled={resendingId === r.id} className="text-slate-500 hover:text-neon-blue text-xs disabled:opacity-50">
                      {resendingId === r.id ? "Resending…" : "Resend"}
                    </button>
                    <button onClick={() => (editingId === r.id ? setEditingId(null) : openEdit(r))} className="text-slate-500 hover:text-neon-blue text-xs">
                      {editingId === r.id ? "Close" : "Edit"}
                    </button>
                    <button onClick={() => remove(r.id)} className="text-slate-500 hover:text-rose-400 text-xs">
                      Remove
                    </button>
                  </div>
                </div>

                {editingId === r.id && (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <StickyFields
                      guildId={params.guildId}
                      channelId={channelId}
                      onChannelChange={setChannelId}
                      channelLocked
                      ownKey={r.id}
                      form={form}
                      onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
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
          <p className="font-medium mb-3">Add Sticky</p>
          <StickyFields
            guildId={params.guildId}
            channelId={draftChannelId}
            onChannelChange={setDraftChannelId}
            channelLocked={false}
            ownKey={draftKey}
            form={draft}
            onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          />
          <button onClick={create} className="neon-button">
            Set Sticky
          </button>
          <FormError message={createError} />
        </NeonCard>
      )}
    </div>
  );
}
