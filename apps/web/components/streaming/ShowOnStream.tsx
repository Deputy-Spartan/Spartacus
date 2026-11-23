"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";

// Streaming › Overlays: show or hide an overlay on stream. Hiding fades it
// out in OBS and keeps everything as it is, so showing it brings it right back.
// The Stream Deck "Show / Hide Overlay" key flips the same switch.

type Vis = Record<string, boolean>;
let shared: Vis | null = null;
const listeners = new Set<(v: Vis) => void>();
let loading: Promise<unknown> | null = null;

export function useOverlayVisibility(guildId: string) {
  const [vis, setVis] = useState<Vis | null>(shared);
  useEffect(() => {
    listeners.add(setVis);
    if (!shared && !loading)
      loading = api
        .getOverlayVisibility(guildId)
        .then((v) => {
          shared = v;
          listeners.forEach((f) => f(v));
        })
        .catch(() => null)
        .finally(() => (loading = null));
    // Stream Deck presses change it too.
    const t = setInterval(() => {
      if (document.hidden) return;
      api
        .getOverlayVisibility(guildId)
        .then((v) => {
          if (JSON.stringify(v) === JSON.stringify(shared)) return;
          shared = v;
          listeners.forEach((f) => f(v));
        })
        .catch(() => null);
    }, 5000);
    return () => {
      listeners.delete(setVis);
      clearInterval(t);
    };
  }, [guildId]);
  const set = async (id: string, on: boolean) => {
    shared = { ...(shared ?? {}) };
    if (on) delete shared[id];
    else shared[id] = false;
    listeners.forEach((f) => f({ ...shared! }));
    const v = await api.setOverlayShown(guildId, id, on).catch(() => null);
    if (v) {
      shared = v;
      listeners.forEach((f) => f(v));
    }
  };
  return { vis, shown: (id: string) => vis?.[id] !== false, set };
}

// The big switch at the top of an overlay's page.
export function ShowOnStream({ guildId, id }: { guildId: string; id: string }) {
  const { vis, shown, set } = useOverlayVisibility(guildId);
  const on = shown(id);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={!vis}
      onClick={() => set(id, !on)}
      className={`flex items-center gap-2.5 rounded-full border-2 pl-1.5 pr-3.5 py-1 text-sm font-semibold transition-colors disabled:opacity-50 ${on ? "border-emerald-400/70 text-emerald-200" : "border-white/15 text-slate-400"}`}
      title="Show or hide this overlay on stream"
    >
      <span className={`relative w-10 h-6 rounded-full transition-colors ${on ? "bg-emerald-500" : "bg-slate-600"}`} aria-hidden="true">
        <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${on ? "translate-x-4" : ""}`} />
      </span>
      {on ? "On stream" : "Hidden"}
    </button>
  );
}

// The small switch on each card in the Overlays list.
export function ShowOnStreamSmall({ guildId, id, label }: { guildId: string; id: string; label: string }) {
  const { vis, shown, set } = useOverlayVisibility(guildId);
  const on = shown(id);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`Show ${label} on stream`}
      disabled={!vis}
      onClick={() => set(id, !on)}
      className={`pointer-events-auto flex items-center gap-1.5 text-xs font-semibold ${on ? "text-emerald-300" : "text-slate-500"}`}
    >
      <span className={`relative w-8 h-5 rounded-full transition-colors ${on ? "bg-emerald-500" : "bg-slate-600"}`} aria-hidden="true">
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${on ? "translate-x-3" : ""}`} />
      </span>
      {on ? "On" : "Off"}
    </button>
  );
}
