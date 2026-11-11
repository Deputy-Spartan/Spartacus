"use client";

import { useEffect, useState } from "react";
import type { AutoSaveStatus } from "../../lib/useAutoSave";
import { Icon } from "./AppIcon";

// Shows what auto-save is doing. Next to the page's button it's a small note;
// while a change is waiting or saving (and briefly after it saves) a bar also
// floats at the bottom of the screen, so you always see it without scrolling.
// If saving fails, the bar offers Save now (when the page passes onSave).
export function SaveStatus({ status, onSave }: { status: AutoSaveStatus; onSave?: () => unknown }) {
  const [showSaved, setShowSaved] = useState(false);
  useEffect(() => {
    if (status !== "saved") return;
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 2200);
    return () => clearTimeout(t);
  }, [status]);

  const text =
    status === "pending" ? "Unsaved changes…" : status === "saving" ? "Saving…" : status === "saved" ? "Saved ✓" : status === "error" ? "Couldn't save — try the button." : "Changes save automatically.";
  const color = status === "saved" ? "text-emerald-400" : status === "error" ? "text-rose-400" : status === "idle" ? "text-slate-600" : "text-slate-400";
  const floating = status === "pending" || status === "saving" || status === "error" || (status === "saved" && showSaved);

  return (
    <>
      <span className={`text-xs ml-3 ${color}`}>{text}</span>
      {floating && (
        <div
          role="status"
          aria-live="polite"
          className="save-bar fixed left-1/2 -translate-x-1/2 bottom-20 md:bottom-6 z-40 flex items-center gap-3 rounded-xl border border-white/10 bg-[#111214] px-4 py-2.5 text-sm text-white shadow-2xl shadow-black/50"
        >
          {status === "saved" ? (
            <span className="text-emerald-400">
              <Icon name="circle-check" size={16} />
            </span>
          ) : status === "error" ? (
            <span className="text-rose-400">
              <Icon name="circle-alert" size={16} />
            </span>
          ) : (
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          )}
          <span>{status === "pending" ? "Unsaved changes" : status === "saving" ? "Saving…" : status === "saved" ? "All changes saved" : "Couldn't save"}</span>
          {status === "error" && onSave && (
            <button type="button" onClick={() => onSave()} className="rounded-lg bg-[#7b99bc] px-3 py-1 text-xs font-semibold text-[#10151c]">
              Save now
            </button>
          )}
        </div>
      )}
    </>
  );
}
