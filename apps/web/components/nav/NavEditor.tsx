"use client";

import { useEffect, useState } from "react";
import { useNavLayout } from "../../lib/navLayout";
import { AppIcon } from "../ui/AppIcon";

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
      className="flex-1 min-w-0 bg-base-950 border border-amber-400/30 focus:border-amber-400 rounded-md px-2 py-1 text-sm text-slate-100 focus:outline-none"
    />
  );
}

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
    <div className="px-3 pb-6 space-y-3">
      <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100 space-y-2">
        <p>
          <b>Edit Mode.</b> Type in a box to rename it. Use ▲ ▼ to move things. Hide takes it out of the menu, but search still finds it. Changes save by
          themselves, and everyone with dashboard access sees your menu.
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

      <ul className="space-y-1.5">
        {L.sections.map((s, si) => {
          const isOpen = open === s.key;
          return (
            <li key={s.key} className={`rounded-lg border border-white/10 ${s.hidden ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-1 p-1.5">
                <button type="button" className={btn} disabled={si === 0} onClick={() => run(L.moveGroup(s.key, -1))} aria-label={`Move ${s.label} up`}>
                  ▲
                </button>
                <button
                  type="button"
                  className={btn}
                  disabled={si === L.sections.length - 1}
                  onClick={() => run(L.moveGroup(s.key, 1))}
                  aria-label={`Move ${s.label} down`}
                >
                  ▼
                </button>
                {s.icon && <AppIcon emoji={s.icon} size={18} />}
                <NameBox value={s.label} original={s.originalLabel} label={`Name of the ${s.originalLabel} group`} onCommit={(v) => run(L.renameGroup(s.key, v))} />
                <button type="button" className={`${btn} w-auto px-2`} onClick={() => run(L.toggleGroupHidden(s.key))}>
                  {s.hidden ? "Show" : "Hide"}
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
                <ul className="border-t border-white/10 p-1.5 pl-4 space-y-1">
                  {s.items.map((item, ii) => (
                    <li key={item.href} className={`flex items-center gap-1 ${item.hidden ? "opacity-50" : ""}`}>
                      <button
                        type="button"
                        className={btn}
                        disabled={ii === 0}
                        onClick={() => run(L.movePage(s.key, item.href, -1))}
                        aria-label={`Move ${item.label} up`}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        className={btn}
                        disabled={ii === s.items.length - 1}
                        onClick={() => run(L.movePage(s.key, item.href, 1))}
                        aria-label={`Move ${item.label} down`}
                      >
                        ▼
                      </button>
                      <AppIcon emoji={item.icon} size={16} />
                      <NameBox
                        value={item.label}
                        original={item.originalLabel}
                        label={`Name of the ${item.originalLabel} page`}
                        onCommit={(v) => run(L.renamePage(item.href, item.originalLabel, v))}
                      />
                      <button type="button" className={`${btn} w-auto px-2`} onClick={() => run(L.togglePageHidden(item.href))}>
                        {item.hidden ? "Show" : "Hide"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
