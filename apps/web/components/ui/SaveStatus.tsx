"use client";

import type { AutoSaveStatus } from "../../lib/useAutoSave";

// Small "Saving… / Saved ✓" note that sits next to a page's save button.
export function SaveStatus({ status }: { status: AutoSaveStatus }) {
  if (status === "idle") return <span className="text-xs text-slate-600 ml-3">Changes save automatically.</span>;
  const text =
    status === "pending" ? "Unsaved changes…" : status === "saving" ? "Saving…" : status === "saved" ? "Saved ✓" : "Couldn't save — try the button.";
  const color =
    status === "saved" ? "text-emerald-400" : status === "error" ? "text-rose-400" : "text-slate-400";
  return <span className={`text-xs ml-3 ${color}`}>{text}</span>;
}
