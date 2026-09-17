"use client";

import { useEffect, useRef, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { StickyPreview } from "../../../../components/ui/StickyPreview";
import { MarkdownToolbar } from "../../../../components/ui/MarkdownToolbar";
import { ButtonsEditor } from "../../../../components/ui/ButtonsEditor";
import { SavedEmbedPicker } from "../../../../components/embedCreator/SavedEmbedPicker";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { Required } from "../../../../components/ui/Required";
import { FormError } from "../../../../components/ui/FormError";
import { api, type StickyMessageInput, type StickyMessageRow } from "../../../../lib/api";

type Tab = "active" | "create";

const EMPTY_FORM: StickyMessageInput = {
  content: "",
  embedEnabled: false,
  embedTitle: "",
  embedDescription: "",
  embedColor: "#5865F2",
  buttons: [],
  embedExtra: {},
  savedEmbedId: null,
};

// The full field set — shared by the Active tab's inline editor and the
// Create tab's fresh draft, wired to whichever value/onChange the caller
// passes in.
function StickyFields({
  guildId,
  channelId,
  onChannelChange,
  channelLocked,
  form,
  onChange,
}: {
  guildId: string;
  channelId: string | null;
  onChannelChange: (id: string | null) => void;
  channelLocked: boolean;
  form: StickyMessageInput;
  onChange: (patch: Partial<StickyMessageInput>) => void;
}) {
  const contentRef = useRef<HTMLTextAreaElement>(null);

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

      <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Message</label>
      <MarkdownToolbar guildId={guildId} textareaRef={contentRef} value={form.content} onChange={(v) => onChange({ content: v })} />
      <textarea
        ref={contentRef}
        className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4 min-h-20"
        value={form.content}
        onChange={(e) => onChange({ content: e.target.value })}
      />

      <div className="mb-4">
        <ButtonsEditor guildId={guildId} buttons={form.buttons} onChange={(next) => onChange({ buttons: next })} />
      </div>

      <SavedEmbedPicker guildId={guildId} value={form.savedEmbedId ?? null} onChange={(id) => onChange({ savedEmbedId: id })} />

      <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Preview</label>
      <div className="mb-4">
        {form.savedEmbedId && <p className="text-xs text-slate-600 mb-2">Preview reflects the saved embed once sent.</p>}
        <StickyPreview
          content={form.content}
          embedEnabled={false}
          embedTitle=""
          embedDescription=""
          embedColor="#5865F2"
          buttons={form.buttons}
          embedExtra={{}}
        />
      </div>
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
  const [createError, setCreateError] = useState<string | null>(null);

  function refresh() {
    api.getStickyMessages(params.guildId).then(setRows);
  }
  useEffect(refresh, [params.guildId]);

  function resetDraft() {
    setDraftChannelId(null);
    setDraft(EMPTY_FORM);
    setCreateError(null);
  }

  function openEdit(row: StickyMessageRow) {
    setEditingId(row.id);
    setChannelId(row.channelId);
    setForm({
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
    const hasContent = !!form.content.trim() || !!form.embedTitle?.trim() || !!form.embedDescription?.trim();
    if (!hasContent) {
      setError("Fill in at least one message field before saving.");
      return;
    }
    setError(null);
    await api.updateStickyMessage(params.guildId, editingId, form);
    setEditingId(null);
    refresh();
  }

  async function create() {
    const hasContent = !!draft.content.trim() || !!draft.embedTitle?.trim() || !!draft.embedDescription?.trim();
    if (!draftChannelId || !hasContent) {
      setCreateError("Select a channel and fill in at least one message field before saving.");
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
                    <span className="text-slate-300 truncate block">{r.embedTitle || r.content}</span>
                    <span className="text-slate-600 text-xs">
                      {r.embedEnabled && "Embed"}
                      {r.embedEnabled && r.buttons.length > 0 && " · "}
                      {r.buttons.length > 0 && `${r.buttons.length} button${r.buttons.length === 1 ? "" : "s"}`}
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
                      form={form}
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
          <p className="font-medium mb-3">Add Sticky</p>
          <StickyFields
            guildId={params.guildId}
            channelId={draftChannelId}
            onChannelChange={setDraftChannelId}
            channelLocked={false}
            form={draft}
            onChange={(patch) => setDraft({ ...draft, ...patch })}
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
