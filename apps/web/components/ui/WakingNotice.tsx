"use client";

import { useEffect, useState } from "react";

// Shows "Waking up Spartacus" while the API is starting up and loads are
// being tried again (see fetchWithWake in lib/api.ts).
export function WakingNotice() {
  const [state, setState] = useState<{ attempt: number; max: number } | null>(null);

  useEffect(() => {
    const waking = (e: Event) => setState((e as CustomEvent<{ attempt: number; max: number }>).detail);
    const awake = () => setState(null);
    window.addEventListener("spartacus:waking", waking);
    window.addEventListener("spartacus:awake", awake);
    return () => {
      window.removeEventListener("spartacus:waking", waking);
      window.removeEventListener("spartacus:awake", awake);
    };
  }, []);

  if (!state) return null;
  return (
    <div
      role="status"
      className="fixed left-1/2 -translate-x-1/2 bottom-24 md:bottom-6 z-[100] flex items-center gap-3 rounded-xl border border-white/10 bg-base-900/95 px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur max-w-[calc(100vw-32px)]"
    >
      <span className="h-6 w-6 shrink-0 rounded-full border-[3px] border-white/10 border-t-neon-blue animate-spin" />
      <span className="text-left">
        <span className="block text-sm font-semibold text-slate-100">Waking up Spartacus</span>
        <span className="block text-xs text-slate-400">
          This can take up to a minute. Trying again on its own (try {state.attempt} of {state.max}).
        </span>
      </span>
    </div>
  );
}
