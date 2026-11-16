"use client";

import { useEffect, useState } from "react";
import { CHECKLIST_MAX, DEFAULT_CHECKLIST } from "@spartacus/shared";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { SaveStatus } from "../../../../components/ui/SaveStatus";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { useAutoSave } from "../../../../lib/useAutoSave";
import { api } from "../../../../lib/api";

const field = "w-full min-w-0 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm";
const hint = "text-xs text-slate-500";
const button = "text-sm px-3 py-2 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:border-white/30 transition-colors disabled:opacity-40";
const small = "shrink-0 w-9 h-9 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:border-white/30 disabled:opacity-30";

// The pre-stream checklist: the items /prestream shows. They're stored on the
// Stream Growth settings, so this page only reads and writes that one field.
export default function PreStreamPage({ params }: { params: { guildId: string } }) {
  const guildId = params.guildId;
  const confirm = useConfirm();
  const [list, setList] = useState<string[] | null>(null);
  const [item, setItem] = useState("");
  const [ticked, setTicked] = useState<number[]>([]);

  useEffect(() => {
    api
      .getStreamGrowth(guildId)
      .then((d) => setList(d.config.checklist))
      .catch(() => setList([...DEFAULT_CHECKLIST]));
  }, [guildId]);

  const autoSave = useAutoSave(list, async () => {
    if (list) await api.saveStreamGrowth(guildId, { checklist: list.map((x) => x.trim()).filter(Boolean) });
  });

  if (!list) return <p className="text-slate-400">Loading…</p>;

  const set = (next: string[]) => {
    setList(next.slice(0, CHECKLIST_MAX));
    setTicked([]);
  };
  const add = () => {
    const t = item.trim();
    if (!t || list.length >= CHECKLIST_MAX) return;
    set([...list, t]);
    setItem("");
  };
  const move = (i: number, by: number) => {
    const next = [...list];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    set(next);
  };
  const shown = list.map((x) => x.trim()).filter(Boolean);
  const done = ticked.filter((i) => i < shown.length).length;

  return (
    <div>
      <ModuleHeader
        guildId={guildId}
        moduleKey="PRE_STREAM"
        title="Pre-Stream Checklist"
        description="The things to check before you go live. Run /prestream in Discord and tap each one as you do it. Only you see it."
      />
      <div className="flex items-center gap-2 mb-4">
        <SaveStatus status={autoSave} />
      </div>
      <div className="space-y-4 max-w-3xl">
        <NeonCard>
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="font-medium">📋 Your checklist</p>
              <p className={hint}>
                {list.length} of {CHECKLIST_MAX} items. Saves by itself.
              </p>
            </div>
            <button
              className={button}
              onClick={async () => {
                if (await confirm("This puts back the starting list and removes your own items.", { title: "Reset the checklist?", confirmLabel: "Reset" })) set([...DEFAULT_CHECKLIST]);
              }}
            >
              Reset
            </button>
          </div>

          {list.length === 0 && <p className={`${hint} mb-3`}>No items yet. Add one below.</p>}
          <ul className="space-y-2">
            {list.map((t, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <span className={`${hint} w-5 shrink-0 text-right`}>{i + 1}.</span>
                <input className={field} value={t} maxLength={60} onChange={(e) => set(list.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Item ${i + 1}`} />
                <button className={small} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                  ↑
                </button>
                <button className={small} disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                  ↓
                </button>
                <button className={`${small} text-rose-300 hover:text-rose-200`} onClick={() => set(list.filter((_, j) => j !== i))} aria-label="Remove">
                  ✕
                </button>
              </li>
            ))}
          </ul>

          {list.length < CHECKLIST_MAX ? (
            <div className="flex gap-2 mt-3">
              <input className={field} placeholder="Add an item (example: Water bottle filled)" value={item} maxLength={60} onChange={(e) => setItem(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
              <button className={`${button} shrink-0`} disabled={!item.trim()} onClick={add}>
                Add
              </button>
            </div>
          ) : (
            <p className="text-xs text-amber-200 mt-3">That's the most it can hold ({CHECKLIST_MAX}). Remove one to add another.</p>
          )}
        </NeonCard>

        <NeonCard>
          <p className="font-medium">👀 How it looks in Discord</p>
          <p className={`${hint} mb-3`}>This is what /prestream shows. Tap items here to try it.</p>
          <div className="rounded-lg border-l-4 bg-base-950 p-3" style={{ borderColor: shown.length && done === shown.length ? "#3ba55d" : "#ffd700" }}>
            <p className="font-semibold text-sm mb-2">{shown.length && done === shown.length ? "✅ All set. Go live!" : `📋 Pre-stream checklist (${done}/${shown.length})`}</p>
            {shown.map((t, i) => (
              <button key={i} className="block text-left text-sm text-slate-300 hover:text-white py-0.5" onClick={() => setTicked((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))}>
                {ticked.includes(i) ? "✅" : "⬜"} {t}
              </button>
            ))}
            <p className={`${hint} mt-3`}>Below this, Discord also shows your linked channels, connected accounts and next scheduled stream.</p>
          </div>
        </NeonCard>
      </div>
    </div>
  );
}
