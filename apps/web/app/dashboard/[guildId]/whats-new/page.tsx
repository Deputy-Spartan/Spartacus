"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { Required } from "../../../../components/ui/Required";
import { FormError } from "../../../../components/ui/FormError";
import { api, type ChangelogEntryRow } from "../../../../lib/api";
import { useOwnerGuard } from "../../../../lib/useOwnerGuard";

type Tab = "active" | "create";

interface Draft {
  title: string;
  description: string;
}

const EMPTY: Draft = { title: "", description: "" };

function ChangelogFields({ value, onChange }: { value: Draft; onChange: (patch: Partial<Draft>) => void }) {
  return (
    <>
      <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
        Title
        <Required />
      </label>
      <input
        className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
        placeholder="LFG categories & the emoji picker"
        value={value.title}
        onChange={(e) => onChange({ title: e.target.value })}
      />
      <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
        Description
        <Required />
      </label>
      <textarea
        className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm min-h-24"
        placeholder="What changed, in a sentence or two."
        value={value.description}
        onChange={(e) => onChange({ description: e.target.value })}
      />
    </>
  );
}

export default function WhatsNewPage({ params }: { params: { guildId: string } }) {
  const ownerAccess = useOwnerGuard(params.guildId);
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("active");
  const [entries, setEntries] = useState<ChangelogEntryRow[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Draft>(EMPTY);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  function refresh() {
    api.getChangelog().then(setEntries);
  }
  useEffect(() => {
    if (ownerAccess === "allowed") refresh();
  }, [ownerAccess]);

  function openEdit(entry: ChangelogEntryRow) {
    setEditingId(entry.id);
    setForm({ title: entry.title, description: entry.description });
    setError(null);
  }

  function validate(d: Draft): string | null {
    if (!d.title.trim()) return "Enter a title.";
    if (!d.description.trim()) return "Enter a description.";
    return null;
  }

  async function saveEdit() {
    const validationError = validate(form);
    if (validationError) return setError(validationError);
    if (!editingId) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateChangelogEntry(editingId, form);
      setEditingId(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
    setSaving(false);
  }

  async function createEntry() {
    const validationError = validate(draft);
    if (validationError) return setCreateError(validationError);
    setCreating(true);
    setCreateError(null);
    try {
      await api.addChangelogEntry(draft.title, draft.description);
      setDraft(EMPTY);
      setTab("active");
      refresh();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to post update");
    }
    setCreating(false);
  }

  async function remove(entry: ChangelogEntryRow) {
    if (!(await confirm(`Delete "${entry.title}"? It disappears from every server's Overview page immediately.`, { danger: true }))) return;
    await api.deleteChangelogEntry(entry.id);
    if (editingId === entry.id) setEditingId(null);
    refresh();
  }

  if (ownerAccess !== "allowed") return null;

  return (
    <div>
      <span className="inline-flex items-center gap-1 bg-purple-500/15 text-purple-300 text-[10.5px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full mb-2">
        🔑 Owner only
      </span>
      <h1 className="text-2xl font-bold mb-1">What's New</h1>
      <p className="text-slate-400 mb-6 max-w-2xl">
        Posts here show on the "What's new" card on every server's Overview page — not just this one — and light up the 🔔 in the header for
        anyone who hasn't seen them yet.
      </p>

      <div className="flex gap-1 mb-5 border-b border-white/5">
        <button
          onClick={() => setTab("active")}
          className={[
            "px-4 py-2 text-sm border-b-2 transition-colors",
            tab === "active" ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
          ].join(" ")}
        >
          Posted Updates
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
          + Post New
        </button>
      </div>

      {tab === "active" &&
        (entries === null ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : entries.length === 0 ? (
          <NeonCard>
            <div className="text-center py-10">
              <p className="text-sm text-slate-400 mb-1">Nothing posted yet.</p>
              <p className="text-xs text-slate-600 mb-4">Post an update and it shows up on every server's Overview page.</p>
              <button onClick={() => setTab("create")} className="neon-button-sm">
                + Post New
              </button>
            </div>
          </NeonCard>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <NeonCard key={entry.id}>
                <div className="flex items-center justify-between gap-3">
                  <button className="min-w-0 flex-1 text-left" onClick={() => (editingId === entry.id ? setEditingId(null) : openEdit(entry))}>
                    <p className="font-medium truncate">{entry.title}</p>
                    <p className="text-xs text-slate-500 truncate">{new Date(entry.createdAt).toLocaleString()}</p>
                  </button>
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={() => (editingId === entry.id ? setEditingId(null) : openEdit(entry))} className="text-xs text-slate-500 hover:text-neon-blue">
                      {editingId === entry.id ? "Close" : "Edit"}
                    </button>
                    <button onClick={() => remove(entry)} className="text-xs text-slate-500 hover:text-rose-400">
                      Delete
                    </button>
                  </div>
                </div>

                {editingId === entry.id && (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <ChangelogFields value={form} onChange={(patch) => setForm({ ...form, ...patch })} />
                    <button onClick={saveEdit} disabled={saving} className="neon-button mt-4 disabled:opacity-50">
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
        <NeonCard className="max-w-lg">
          <p className="font-medium mb-3">Post an Update</p>
          <ChangelogFields value={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} />
          <button onClick={createEntry} disabled={creating} className="neon-button mt-4 disabled:opacity-50">
            {creating ? "Posting…" : "Post Update"}
          </button>
          <FormError message={createError} />
        </NeonCard>
      )}
    </div>
  );
}
