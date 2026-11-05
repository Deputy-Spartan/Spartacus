"use client";

import { useEffect, useState } from "react";
import { DEFAULT_QUICK_LINKS, QUICK_LINK_LIMITS, QUICK_LINKS_EVENT, type QuickLinkGroup } from "@spartacus/shared";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { EmojiPicker } from "../../../../components/ui/EmojiPicker";
import { api, type QuickLinksStatus } from "../../../../lib/api";

const field = "w-full bg-base-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm";
const L = QUICK_LINK_LIMITS;

function ago(iso: string | null | undefined) {
  if (!iso) return "";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 90 ? `${s}s ago` : `${Math.round(s / 60)} min ago`;
}

function StatusLine({ id, status }: { id: string; status: QuickLinksStatus | null }) {
  if (!status) return null;
  if (id === "render") {
    const map = { online: ["text-emerald-400", "Bot online"], updating: ["text-amber-300", "Bot updating"], offline: ["text-rose-400", "Bot offline"] } as const;
    const [cls, text] = map[status.bot] ?? map.offline;
    return <p className={`text-xs ${cls}`}>● {text}{status.lastHeartbeatAt ? ` · last heard from ${ago(status.lastHeartbeatAt)}` : ""}</p>;
  }
  if (id === "vercel") {
    return <p className={`text-xs ${status.dashboardDeploying ? "text-amber-300" : "text-emerald-400"}`}>● {status.dashboardDeploying ? "Dashboard update in progress" : "Dashboard up to date"}</p>;
  }
  return null;
}

export default function QuickLinksPage({ params }: { params: { guildId: string } }) {
  const guildId = params.guildId;
  const confirm = useConfirm();
  const [groups, setGroups] = useState<QuickLinkGroup[] | null>(null);
  const [status, setStatus] = useState<QuickLinksStatus | null>(null);
  const [draft, setDraft] = useState<QuickLinkGroup[] | null>(null); // non-null while editing
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .getQuickLinks()
      .then((r) => {
        setGroups(r.groups);
        setStatus(r.status);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load Quick Links."));
  }, []);

  const editing = draft !== null;
  const shown = draft ?? groups ?? [];

  function change(i: number, patch: Partial<QuickLinkGroup>) {
    setDraft((d) => d && d.map((g, n) => (n === i ? { ...g, ...patch } : g)));
  }
  function changeLink(i: number, j: number, patch: Partial<{ label: string; url: string }>) {
    setDraft((d) => d && d.map((g, n) => (n === i ? { ...g, links: g.links.map((l, m) => (m === j ? { ...l, ...patch } : l)) } : g)));
  }
  function move(i: number, by: number) {
    setDraft((d) => {
      if (!d) return d;
      const j = i + by;
      if (j < 0 || j >= d.length) return d;
      const next = [...d];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function addGroup() {
    setDraft((d) => d && [...d, { id: Math.random().toString(36).slice(2, 10), icon: "🔗", name: "New site", note: "", pinned: true, links: [{ label: "Open", url: "" }] }]);
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const r = await api.saveQuickLinks(draft);
      setGroups(r.groups);
      setDraft(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      window.dispatchEvent(new Event(QUICK_LINKS_EVENT));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }
  async function reset() {
    if (!(await confirm("Put Quick Links back to the starting set? Your own links and changes are removed.", { title: "Reset Quick Links", confirmLabel: "Reset", danger: true }))) return;
    const r = await api.resetQuickLinks().catch(() => null);
    if (r) {
      setGroups(r.groups);
      setDraft(null);
      window.dispatchEvent(new Event(QUICK_LINKS_EVENT));
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold mb-1">🔗 Quick Links</h1>
          <p className="text-slate-400">Every site Spartacus runs on, one click away. Links open in a new tab. Pinned sites also show under Quick Links in the sidebar.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <button type="button" onClick={() => setDraft(null)} className="neon-button-sm bg-transparent border border-white/15 text-slate-300">
                Cancel
              </button>
              <button type="button" onClick={save} disabled={saving} className="neon-button-sm">
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          ) : (
            <>
              {saved && <span className="self-center text-sm text-emerald-400">✓ Saved</span>}
              <button type="button" onClick={() => groups && setDraft(structuredClone(groups))} disabled={!groups} className="neon-button-sm">
                ✏️ Edit
              </button>
            </>
          )}
        </div>
      </div>
      {error && <p className="text-sm text-rose-400 mb-4">{error}</p>}
      {!groups && !error && <p className="text-sm text-slate-500">Loading…</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4 items-start">
        {shown.map((g, i) =>
          editing ? (
            <NeonCard key={g.id}>
              <div className="space-y-2.5">
                <div className="flex items-start gap-2">
                  <div className="w-36 shrink-0">
                    <EmojiPicker guildId={guildId} value={g.icon} onChange={(v) => change(i, { icon: v || "🔗" })} popover placeholder="Icon" />
                  </div>
                  <input className={field} value={g.name} maxLength={L.name} onChange={(e) => change(i, { name: e.target.value })} placeholder="Site name" aria-label="Site name" />
                </div>
                <input className={field} value={g.note} maxLength={L.note} onChange={(e) => change(i, { note: e.target.value })} placeholder="What it's for (optional)" aria-label="What it's for" />
                <div className="space-y-1.5">
                  {g.links.map((l, j) => (
                    <div key={j} className="flex gap-1.5">
                      <input className={`${field} w-2/5`} value={l.label} maxLength={L.label} onChange={(e) => changeLink(i, j, { label: e.target.value })} placeholder="Label" aria-label="Link label" />
                      <input className={field} value={l.url} maxLength={L.url} onChange={(e) => changeLink(i, j, { url: e.target.value })} placeholder="https://…" aria-label="Link address" inputMode="url" />
                      <button
                        type="button"
                        onClick={() => change(i, { links: g.links.filter((_, m) => m !== j) })}
                        className="px-2 text-slate-500 hover:text-rose-400"
                        aria-label={`Remove ${l.label}`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {g.links.length < L.links && (
                    <button type="button" onClick={() => change(i, { links: [...g.links, { label: "", url: "" }] })} className="text-xs text-neon-blue hover:underline">
                      + Add a link
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/5">
                  <label className="flex items-center gap-1.5 text-xs text-slate-300 mr-auto">
                    <input type="checkbox" checked={g.pinned} onChange={(e) => change(i, { pinned: e.target.checked })} /> 📌 Show in the sidebar
                  </label>
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-xs text-slate-400 hover:text-white disabled:opacity-30" aria-label="Move up">
                    ▲
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === shown.length - 1} className="text-xs text-slate-400 hover:text-white disabled:opacity-30" aria-label="Move down">
                    ▼
                  </button>
                  <button type="button" onClick={() => setDraft((d) => d && d.filter((_, n) => n !== i))} className="text-xs text-rose-400 hover:text-rose-300">
                    Delete site
                  </button>
                </div>
              </div>
            </NeonCard>
          ) : (
            <NeonCard key={g.id}>
              <div className="flex items-start gap-3">
                <span className="text-xl w-9 h-9 shrink-0 rounded-lg bg-white/5 flex items-center justify-center">{g.icon.startsWith("<") ? "🔗" : g.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold flex items-center gap-2">
                    {g.name}
                    {g.pinned && <span className="text-[10px] text-slate-500" title="Shown in the sidebar">📌</span>}
                  </p>
                  {g.note && <p className="text-xs text-slate-400">{g.note}</p>}
                  <StatusLine id={g.id} status={status} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {g.links.map((l, j) =>
                  l.url ? (
                    <a
                      key={j}
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-neon-blue border border-white/10 rounded-md px-2 py-1 hover:border-neon-blue/60 hover:bg-neon-blue/10 transition-colors"
                    >
                      {l.label} <span className="text-slate-500">↗</span>
                    </a>
                  ) : (
                    <span key={j} className="text-xs text-slate-500 border border-dashed border-white/10 rounded-md px-2 py-1" title="No address yet. Press Edit to add one.">
                      {l.label} (not set)
                    </span>
                  )
                )}
                {g.links.length === 0 && <span className="text-xs text-slate-500">No links yet. Press Edit to add some.</span>}
              </div>
            </NeonCard>
          )
        )}
        {editing && shown.length < L.groups && (
          <button
            type="button"
            onClick={addGroup}
            className="rounded-xl border-2 border-dashed border-white/10 hover:border-neon-blue/50 text-slate-400 hover:text-neon-blue p-6 text-sm transition-colors"
          >
            + Add a site
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>Addresses need to start with https:// (it's added for you if you leave it off). Leave one blank to fill in later.</span>
          <button type="button" onClick={reset} className="text-rose-400 hover:text-rose-300 ml-auto">
            Reset to the starting set
          </button>
        </div>
      )}
      {!editing && groups && groups.length === 0 && (
        <p className="text-sm text-slate-500">
          No links yet. Press Edit to add your first site, or{" "}
          <button type="button" className="text-neon-blue hover:underline" onClick={() => setDraft(structuredClone(DEFAULT_QUICK_LINKS))}>
            start from the suggested set
          </button>
          .
        </p>
      )}
    </div>
  );
}
