"use client";

import { useEffect, useState } from "react";
import { useNavLayout } from "../../lib/navLayout";
import { DragList } from "../ui/DragList";

// Edit Mode for the sidebar (owner only): rename, reorder and hide groups and
// their pages. Every change saves straight away; see lib/navLayout.ts.

type Status = "" | "saving" | "saved" | "error";

function NameBox({ value, original, onCommit, label }: { value: string; original: string; onCommit: (v: string) => void; label: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  function commit() {
    const v = draft.trim();
    if (!v) {
      setDraft(value);
      return;
    }
    if (v !== value) onCommit(v);
  }
  return (
    <input
      value={draft}
      maxLength={60}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      aria-label={label}
      title={value !== original ? `Built-in name: ${original}` : undefined}
      className="flex-1 min-w-0 bg-base-950 border border-amber-400/30 focus:border-amber-400 rounded-md px-1.5 py-1 text-[13px] text-slate-100 focus:outline-none"
    />
  );
}

const grip = "shrink-0 w-5 h-8 flex items-center justify-center rounded-md text-amber-300 tracking-[-0.2em] select-none hover:bg-amber-400/10";
const btn = "shrink-0 w-7 h-7 flex items-center justify-center rounded-md border border-white/10 text-[11px] text-slate-300 hover:bg-base-800 disabled:opacity-30 disabled:hover:bg-transparent";

export function NavEditor({ onDone }: { onDone: () => void }) {
  const L = useNavLayout();
  const [open, setOpen] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("");
  const [armReset, setArmReset] = useState(false);

  useEffect(() => {
    if (status !== "saved") return;
    const t = setTimeout(() => setStatus(""), 1800);
    return () => clearTimeout(t);
  }, [status]);

  async function run(p: Promise<unknown>) {
    setStatus("saving");
    try {
      await p;
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div data-edit-skip className="px-3 pb-6 space-y-3">
      <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100 space-y-2">
        <p>
          <b>Edit Mode is on.</b> Here: type in a box to rename it, hold ⋮⋮ and drag to move it, 👁 hides it from the menu (search still finds it). On the page: tap any words to change them, or tap a box and drag ⋮⋮ Move. Everything saves by itself, and everyone with dashboard access sees it.
        </p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onDone} className="rounded-md bg-amber-400 text-base-950 font-semibold px-3 py-1">
            Done
          </button>
          {L.customized && (
            <button
              type="button"
              onClick={() => {
                if (!armReset) return setArmReset(true);
                setArmReset(false);
                run(L.reset());
              }}
              onBlur={() => setArmReset(false)}
              className="rounded-md border border-amber-400/40 px-3 py-1 hover:bg-amber-400/10"
            >
              {armReset ? "Tap again to reset" : "Reset menu"}
            </button>
          )}
          <span role="status" className="ml-auto">
            {status === "saving" && <span className="text-slate-400">Saving…</span>}
            {status === "saved" && <span className="text-emerald-400 font-semibold">✓ Saved</span>}
            {status === "error" && <span className="text-rose-400">Didn't save, try again</span>}
          </span>
        </div>
      </div>

      <DragList
        className="space-y-1.5"
        ids={L.sections.map((s) => s.key)}
        itemLabel={(key) => L.sections.find((s) => s.key === key)?.label ?? key}
        onReorder={(keys) => run(L.setGroupOrder(keys))}
        renderItem={(key, handle) => {
          const s = L.sections.find((x) => x.key === key);
          if (!s) return null;
          const isOpen = open === s.key;
          return (
            <div className={`rounded-lg border border-white/10 ${s.hidden ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-1 p-1.5">
                <button type="button" className={grip} {...handle}>
                  ⋮⋮
                </button>
                <NameBox value={s.label} original={s.originalLabel} label={`Name of the ${s.originalLabel} group`} onCommit={(v) => run(L.renameGroup(s.key, v))} />
                <button type="button" className={btn} onClick={() => run(L.toggleGroupHidden(s.key))} title={s.hidden ? "Show in the menu" : "Hide from the menu"} aria-label={s.hidden ? `Show ${s.label}` : `Hide ${s.label}`}>
                  {s.hidden ? "🚫" : "👁"}
                </button>
                <button
                  type="button"
                  className={btn}
                  onClick={() => setOpen(isOpen ? null : s.key)}
                  aria-expanded={isOpen}
                  aria-label={`${isOpen ? "Close" : "Open"} the pages in ${s.label}`}
                >
                  {isOpen ? "▾" : "▸"}
                </button>
              </div>
              {isOpen && (
                <DragList
                  className="border-t border-white/10 p-1.5 pl-3 space-y-1"
                  ids={s.items.map((i) => i.href)}
                  itemLabel={(href) => s.items.find((i) => i.href === href)?.label ?? href}
                  onReorder={(hrefs) => run(L.setPageOrder(s.key, hrefs))}
                  renderItem={(href, h) => {
                    const item = s.items.find((i) => i.href === href);
                    if (!item) return null;
                    return (
                      <div className={`flex items-center gap-1 ${item.hidden ? "opacity-50" : ""}`}>
                        <button type="button" className={grip} {...h}>
                          ⋮⋮
                        </button>
                        <NameBox
                          value={item.label}
                          original={item.originalLabel}
                          label={`Name of the ${item.originalLabel} page`}
                          onCommit={(v) => run(L.renamePage(item.href, item.originalLabel, v))}
                        />
                        <button type="button" className={btn} onClick={() => run(L.togglePageHidden(item.href))} title={item.hidden ? "Show in the menu" : "Hide from the menu"} aria-label={item.hidden ? `Show ${item.label}` : `Hide ${item.label}`}>
                          {item.hidden ? "🚫" : "👁"}
                        </button>
                      </div>
                    );
                  }}
                />
              )}
            </div>
          );
        }}
      />
    </div>
  );
}