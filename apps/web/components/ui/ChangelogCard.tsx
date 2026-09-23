"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "./NeonCard";
import { api, type ChangelogEntryRow } from "../../lib/api";

// Owner-authored posts (Owner Panel → What's New), shown here to every
// server's dashboard. "Seen" is tracked server-side per account, so
// dismissing on one device clears the bell badge everywhere else too.
export function ChangelogCard() {
  const [entries, setEntries] = useState<ChangelogEntryRow[] | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    api.getChangelog().then(setEntries);
  }, []);

  function dismiss() {
    setDismissed(true);
    api.markChangelogSeen().then(() => window.dispatchEvent(new Event("spartacus:changelog-seen")));
  }

  if (dismissed || !entries || entries.length === 0) return null;

  return (
    <NeonCard className="mb-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <p className="font-medium">✨ What's new</p>
        <button onClick={dismiss} className="text-slate-500 hover:text-slate-300 text-xs shrink-0">
          Dismiss
        </button>
      </div>
      <div className="space-y-3">
        {entries.slice(0, 3).map((entry) => (
          <div key={entry.id}>
            <p className="text-sm font-medium text-slate-200">{entry.title}</p>
            <p className="text-xs text-slate-500 mt-0.5">{entry.description}</p>
          </div>
        ))}
      </div>
    </NeonCard>
  );
}
