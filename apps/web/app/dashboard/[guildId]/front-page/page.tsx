"use client";

import { useEffect, useState } from "react";
import { FRONT_PAGE_DEFAULTS, FRONT_PAGE_LIMITS, type FrontPageCard } from "@spartacus/shared";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { EmojiPicker } from "../../../../components/ui/EmojiPicker";
import { FormError } from "../../../../components/ui/FormError";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { api } from "../../../../lib/api";

// Owner Only → Front Page: the info boxes people see on the sign-in page.
const field = "w-full bg-base-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm";
const L = FRONT_PAGE_LIMITS;

function Preview({ cards }: { cards: FrontPageCard[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="rounded-xl bg-gradient-to-br from-[#23262c] to-[#141518] p-4">
      <p className="mb-3 text-[11px] uppercase tracking-wide text-slate-500">Preview · tap a box</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {cards.map((c, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setOpen(open === i ? null : i)}
            className={`rounded-xl border px-3 py-2.5 text-left ${open === i ? "border-neon-blue/60 bg-neon-blue/[0.14]" : "border-white/[0.07] bg-white/[0.03]"}`}
          >
            <span className="flex items-center gap-2.5">
              <span className="text-lg">{c.icon || "⭐"}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{c.title || "Untitled"}</span>
                <span className="block text-xs text-slate-400">{c.short}</span>
              </span>
            </span>
          </button>
        ))}
      </div>
      {open !== null && cards[open] && (
        <div className="mt-2 rounded-xl border border-neon-blue/30 bg-black/20 px-4 py-3">
          <p className="text-sm font-semibold">
            {cards[open].icon} {cards[open].title}
          </p>
          <ul className="mt-2 space-y-1">
            {cards[open].details.filter(Boolean).map((d, k) => (
              <li key={k} className="flex gap-2 text-[13px] text-slate-300">
                <span className="text-neon-blue">✓</span>
                {d}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function FrontPageEditor({ params }: { params: { guildId: string } }) {
  const guildId = params.guildId;
  const confirm = useConfirm();
  const [saved, setSaved] = useState<FrontPageCard[] | null>(null);
  const [custom, setCustom] = useState(false);
  const [cards, setCards] = useState<FrontPageCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusUrl, setStatusUrl] = useState("");
  const [statusSaved, setStatusSaved] = useState("");
  const [statusNote, setStatusNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api
      .getFrontPage()
      .then((r) => {
        setSaved(r.cards);
        setCards(r.cards);
        setCustom(r.custom);
        setStatusUrl(r.statusUrl ?? "");
        setStatusSaved(r.statusUrl ?? "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load."));
  }, []);

  if (!saved) return <p className="text-slate-400">{error ?? "Loading…"}</p>;
  const dirty = JSON.stringify(cards) !== JSON.stringify(saved);
  const set = (i: number, patch: Partial<FrontPageCard>) => setCards(cards.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const move = (i: number, by: number) => {
    const next = [...cards];
    const [c] = next.splice(i, 1);
    next.splice(i + by, 0, c);
    setCards(next);
  };
  const problem = cards.length < L.minCards ? `Keep at least ${L.minCards} boxes.` : cards.some((c) => !c.title.trim()) ? "Every box needs a title." : null;

  async function saveStatus() {
    try {
      const r = await api.saveStatusPage(statusUrl);
      setStatusUrl(r.statusUrl ?? "");
      setStatusSaved(r.statusUrl ?? "");
      setStatusNote({ ok: true, text: r.statusUrl ? "Saved. It shows on the sign-in page and in the account menu within a minute." : "Removed." });
    } catch (e) {
      setStatusNote({ ok: false, text: e instanceof Error ? e.message : "Couldn't save." });
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.saveFrontPage(cards.map((c) => ({ ...c, details: c.details.filter((d) => d.trim()) })));
      setSaved(r.cards);
      setCards(r.cards);
      setCustom(true);
      setNotice("Saved. The front page shows it within a minute.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">🏠 Front Page</h1>
        <p className="text-sm text-slate-400">The info boxes on the sign-in page at the dashboard's address. Change them as Spartacus grows. Two per row; tap one there to see its ticked lines.</p>
      </div>

      <NeonCard>
        <p className="text-sm font-medium">Status page link</p>
        <p className="text-xs text-slate-500 mb-2">Your public status page, e.g. from UptimeRobot (Status Pages → Add status page). It shows as “● Status” on the sign-in page and as “Status page” in the account menu. Leave empty to hide it.</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={statusUrl} onChange={(e) => setStatusUrl(e.target.value)} placeholder="https://stats.uptimerobot.com/…" className="flex-1 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm" />
          <button type="button" onClick={saveStatus} disabled={statusUrl.trim() === statusSaved} className="neon-button-sm disabled:opacity-40">
            Save link
          </button>
        </div>
        {statusNote && <p className={`text-xs mt-2 ${statusNote.ok ? "text-emerald-400" : "text-rose-400"}`}>{statusNote.text}</p>}
      </NeonCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-3">
          {cards.map((c, i) => (
            <NeonCard key={i}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Box {i + 1}</p>
                <div className="flex gap-1 text-xs">
                  <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="rounded border border-white/10 px-2 py-1 disabled:opacity-30" aria-label="Move up">
                    ↑
                  </button>
                  <button type="button" disabled={i === cards.length - 1} onClick={() => move(i, 1)} className="rounded border border-white/10 px-2 py-1 disabled:opacity-30" aria-label="Move down">
                    ↓
                  </button>
                  <button type="button" disabled={cards.length <= L.minCards} onClick={() => setCards(cards.filter((_, k) => k !== i))} className="rounded px-2 py-1 text-rose-400 hover:bg-rose-500/10 disabled:opacity-30">
                    Remove
                  </button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[150px_1fr]">
                <div>
                  <p className="mb-1 text-xs text-slate-400">Icon</p>
                  <EmojiPicker guildId={guildId} value={c.icon} onChange={(icon) => set(i, { icon })} popover />
                  <p className="mt-1 text-[11px] text-slate-500">Standard emoji only.</p>
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="mb-1 text-xs text-slate-400">Title</p>
                    <input className={field} value={c.title} maxLength={L.title} onChange={(e) => set(i, { title: e.target.value })} placeholder="Matchmaking & tournaments" />
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-slate-400">Short line</p>
                    <input className={field} value={c.short} maxLength={L.short} onChange={(e) => set(i, { short: e.target.value })} placeholder="One line under the title" />
                  </div>
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                <p className="text-xs text-slate-400">Ticked lines when it's opened (up to {L.maxDetails})</p>
                {c.details.map((d, k) => (
                  <div key={k} className="flex gap-2">
                    <span className="pt-1.5 text-neon-blue">✓</span>
                    <input className={field} value={d} maxLength={L.detail} onChange={(e) => set(i, { details: c.details.map((x, j) => (j === k ? e.target.value : x)) })} />
                    <button type="button" className="px-1 text-slate-500 hover:text-rose-400" aria-label="Remove line" onClick={() => set(i, { details: c.details.filter((_, j) => j !== k) })}>
                      ✕
                    </button>
                  </div>
                ))}
                {c.details.length < L.maxDetails && (
                  <button type="button" className="text-xs text-neon-blue hover:underline" onClick={() => set(i, { details: [...c.details, ""] })}>
                    + Add a line
                  </button>
                )}
              </div>
            </NeonCard>
          ))}
          {cards.length < L.maxCards && (
            <button type="button" className="text-sm text-neon-blue hover:underline" onClick={() => setCards([...cards, { icon: "⭐", title: "", short: "", details: [""] }])}>
              + Add a box
            </button>
          )}
        </div>

        <div className="space-y-3 xl:sticky xl:top-4 xl:self-start">
          <Preview cards={cards} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!dirty || !!problem || busy} onClick={save} className="neon-button-sm disabled:opacity-40">
              Save
            </button>
            {dirty && (
              <button type="button" className="text-sm text-slate-300 hover:text-white" onClick={() => setCards(saved)}>
                Undo changes
              </button>
            )}
            {custom && !dirty && (
              <button
                type="button"
                className="text-sm text-slate-400 hover:text-white"
                onClick={async () => {
                  if (!(await confirm("Go back to the original 6 boxes? Your edits are removed."))) return;
                  const r = await api.resetFrontPage();
                  setSaved(r.cards);
                  setCards(r.cards);
                  setCustom(false);
                  setNotice("Back to the original boxes.");
                }}
              >
                Back to the original boxes
              </button>
            )}
            {notice && !dirty && <span className="text-xs text-emerald-400">{notice}</span>}
          </div>
          {dirty && problem && <p className="text-xs text-rose-400">{problem}</p>}
          <FormError message={error} />
          {cards.length % 2 === 1 && <p className="text-xs text-slate-500">Tip: an even number of boxes keeps the rows full.</p>}
          <p className="text-xs text-slate-500">{JSON.stringify(cards) === JSON.stringify(FRONT_PAGE_DEFAULTS) ? "These are the original boxes." : ""}</p>
        </div>
      </div>
    </div>
  );
}
