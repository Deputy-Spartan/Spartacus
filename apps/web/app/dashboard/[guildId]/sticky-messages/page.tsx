"use client";

import { useEffect, useRef, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { StickyPreview } from "../../../../components/ui/StickyPreview";
import { MarkdownToolbar } from "../../../../components/ui/MarkdownToolbar";
import { ButtonsEditor } from "../../../../components/ui/ButtonsEditor";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { api, type StickyMessageInput, type StickyMessageRow } from "../../../../lib/api";

const EMPTY_FORM: StickyMessageInput = {
  content: "",
  embedEnabled: false,
  embedTitle: "",
  embedDescription: "",
  embedColor: "#5865F2",
  buttons: [],
};

export default function StickyMessagesPage({ params }: { params: { guildId: string } }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<StickyMessageRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [form, setForm] = useState<StickyMessageInput>(EMPTY_FORM);
  const [showEditor, setShowEditor] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const embedDescRef = useRef<HTMLTextAreaElement>(null);

  function refresh() {
    api.getStickyMessages(params.guildId).then(setRows);
  }
  useEffect(refresh, [params.guildId]);

  function startCreate() {
    setEditingId(null);
    setChannelId(null);
    setForm(EMPTY_FORM);
    setShowEditor(true);
  }

  function startEdit(row: StickyMessageRow) {
    setEditingId(row.id);
    setChannelId(row.channelId);
    setForm({
      content: row.content,
      embedEnabled: row.embedEnabled,
      embedTitle: row.embedTitle ?? "",
      embedDescription: row.embedDescription ?? "",
      embedColor: row.embedColor ?? "#5865F2",
      buttons: row.buttons,
    });
    setShowEditor(true);
  }

  async function save() {
    if (!channelId || !form.content) return;
    if (editingId) {
      await api.updateStickyMessage(params.guildId, editingId, form);
    } else {
      await api.addStickyMessage(params.guildId, channelId, form);
    }
    setShowEditor(false);
    refresh();
  }

  async function remove(id: string) {
    if (!(await confirm("Delete this sticky message?"))) return;
    await api.deleteStickyMessage(params.guildId, id);
    if (editingId === id) setShowEditor(false);
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <NeonCard>
          <div className="flex items-center justify-between mb-3">
            <p className="font-medium">Active Stickies</p>
            <button onClick={startCreate} className="neon-button-sm">
              + New Sticky
            </button>
          </div>
          {rows.length === 0 && <p className="text-sm text-slate-500">None yet.</p>}
          <div className="divide-y divide-white/5">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2.5 text-sm gap-3">
                <div className="min-w-0">
                  <span className="text-slate-400 truncate block">{r.embedTitle || r.content}</span>
                  <span className="text-slate-600 text-xs">
                    {r.embedEnabled && "Embed"}
                    {r.embedEnabled && r.buttons.length > 0 && " · "}
                    {r.buttons.length > 0 && `${r.buttons.length} button${r.buttons.length === 1 ? "" : "s"}`}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={() => resend(r.id)} disabled={resendingId === r.id} className="text-slate-500 hover:text-neon-blue text-xs disabled:opacity-50">
                    {resendingId === r.id ? "Resending…" : "Resend"}
                  </button>
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
              <p className="font-medium">{editingId ? "Edit Sticky" : "Add Sticky"}</p>
              <button onClick={() => setShowEditor(false)} className="text-slate-500 hover:text-slate-300 text-xs">
                Close
              </button>
            </div>

            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Channel</label>
            <ChannelSelect
              guildId={params.guildId}
              value={channelId}
              onChange={setChannelId}
              kind="text"
              placeholder={editingId ? undefined : "Select a channel…"}
            />
            {editingId && <p className="text-xs text-slate-600 -mt-3 mb-4">Channel can't be changed once created.</p>}

            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
              {form.embedEnabled ? "Fallback / Embed Description" : "Message"}
            </label>
            <MarkdownToolbar guildId={params.guildId} textareaRef={contentRef} value={form.content} onChange={(v) => setForm({ ...form, content: v })} />
            <textarea
              ref={contentRef}
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4 min-h-20"
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />

            <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
              <span className="text-sm text-slate-300">Use an embed</span>
              <ToggleSwitch enabled={form.embedEnabled} onChange={(v) => setForm({ ...form, embedEnabled: v })} />
            </div>

            {form.embedEnabled && (
              <div className="mb-4 space-y-3">
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Embed Title</label>
                  <input
                    className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                    value={form.embedTitle ?? ""}
                    onChange={(e) => setForm({ ...form, embedTitle: e.target.value })}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Embed Description</label>
                  <MarkdownToolbar
                    guildId={params.guildId}
                    textareaRef={embedDescRef}
                    value={form.embedDescription ?? ""}
                    onChange={(v) => setForm({ ...form, embedDescription: v })}
                  />
                  <textarea
                    ref={embedDescRef}
                    className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm min-h-16"
                    value={form.embedDescription ?? ""}
                    onChange={(e) => setForm({ ...form, embedDescription: e.target.value })}
                    placeholder="Defaults to the message above if left blank"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Embed Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="h-9 w-12 rounded-lg border border-white/10 bg-base-950 cursor-pointer"
                      value={form.embedColor ?? "#5865F2"}
                      onChange={(e) => setForm({ ...form, embedColor: e.target.value })}
                    />
                    <input
                      className="flex-1 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm font-mono"
                      value={form.embedColor ?? "#5865F2"}
                      onChange={(e) => setForm({ ...form, embedColor: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="mb-4">
              <ButtonsEditor guildId={params.guildId} buttons={form.buttons} onChange={(next) => setForm({ ...form, buttons: next })} />
            </div>

            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Preview</label>
            <div className="mb-4">
              <StickyPreview
                content={form.content}
                embedEnabled={form.embedEnabled}
                embedTitle={form.embedTitle ?? ""}
                embedDescription={form.embedDescription ?? ""}
                embedColor={form.embedColor ?? "#5865F2"}
                buttons={form.buttons}
              />
            </div>

            <button onClick={save} className="neon-button">
              {editingId ? "Save Changes" : "Set Sticky"}
            </button>
          </NeonCard>
        )}
      </div>
    </div>
  );
}
