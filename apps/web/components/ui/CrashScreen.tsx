"use client";

import { useEffect } from "react";

// What a page shows instead of going blank when something in it breaks.
export function CrashScreen({ error, reset, compact }: { error: Error & { digest?: string }; reset: () => void; compact?: boolean }) {
  useEffect(() => {
    console.error("[dashboard] page crashed:", error);
  }, [error]);

  return (
    <div className={`flex flex-col items-center justify-center gap-3 px-4 text-center ${compact ? "py-20" : "min-h-screen bg-base-950"}`}>
      <p className="text-4xl" aria-hidden="true">⚠️</p>
      <h1 className="text-lg font-semibold text-slate-100">This page hit an error</h1>
      <p className="text-sm text-slate-400 max-w-sm">Your settings are safe. Try again, and if it keeps happening, send a screenshot of this page.</p>
      {error.digest && <p className="text-[11px] text-slate-600">Error code {error.digest}</p>}
      <div className="flex flex-wrap justify-center gap-2 mt-2">
        <button type="button" onClick={reset} className="neon-button">
          Try again
        </button>
        <a href="/dashboard" className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/5">
          Back to dashboard
        </a>
      </div>
    </div>
  );
}
