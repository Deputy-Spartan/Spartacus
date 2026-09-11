"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "./NeonCard";
import { CHANGELOG, LATEST_CHANGELOG_ID } from "../../lib/changelog";

const DISMISS_KEY = "spartacus_changelog_dismissed";

// Dismissed per-browser, not per-account — reappears automatically once
// LATEST_CHANGELOG_ID moves past whatever the viewer last dismissed, so a
// new feature always gets seen at least once without needing a real
// notification system.
export function ChangelogCard() {
  const [dismissed, setDismissed] = useState(true); // default hidden until we've checked localStorage, avoids a flash

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === LATEST_CHANGELOG_ID);
    } catch {
      setDismissed(false);
    }
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, LATEST_CHANGELOG_ID);
    } catch {
      // localStorage unavailable — worst case it shows again next visit, harmless
    }
  }

  if (dismissed || CHANGELOG.length === 0) return null;

  return (
    <NeonCard className="mb-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <p className="font-medium">✨ What's new</p>
        <button onClick={dismiss} className="text-slate-500 hover:text-slate-300 text-xs shrink-0">
          Dismiss
        </button>
      </div>
      <div className="space-y-3">
        {CHANGELOG.slice(0, 3).map((entry) => (
          <div key={entry.date + entry.title}>
            <p className="text-sm font-medium text-slate-200">{entry.title}</p>
            <p className="text-xs text-slate-500 mt-0.5">{entry.description}</p>
          </div>
        ))}
      </div>
    </NeonCard>
  );
}
