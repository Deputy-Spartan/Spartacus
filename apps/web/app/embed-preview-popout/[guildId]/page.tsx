"use client";

import { useEffect, useState } from "react";
import { EmbedCreatorPreview } from "../../../components/embedCreator/EmbedCreatorPreview";
import type { EmbedCreatorState } from "../../../lib/api";

// A bare, chrome-free window meant to be popped out (window.open from the
// Embed Creator page) and parked on a second monitor — deliberately OUTSIDE
// the /dashboard/[guildId] route tree so it skips that layout's sidebar,
// header, and access-gate redirect entirely; this is just a local render
// target, not a page anyone navigates to on its own. Stays in sync via
// BroadcastChannel rather than any server round-trip: the opener posts its
// `state` on every edit, this tab just renders whatever it last received.
// Same-origin/same-browser only — not a shareable link.
export default function EmbedCreatorPreviewPopout({ params }: { params: { guildId: string } }) {
  const [state, setState] = useState<EmbedCreatorState | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(`embed-creator-preview-${params.guildId}`);
    channel.onmessage = (e) => {
      if (e.data?.type === "state") setState(e.data.state);
    };
    // The opener only broadcasts on change — ask it to resend its current
    // state right away so this window isn't blank until the next edit.
    channel.postMessage({ type: "request-sync" });
    return () => channel.close();
  }, [params.guildId]);

  return (
    <div className="min-h-screen bg-base-950 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live Preview</p>
        <span className="flex items-center gap-1.5 text-[11px] text-slate-600">
          <span className={`w-1.5 h-1.5 rounded-full ${state ? "bg-emerald-400" : "bg-slate-600 animate-pulse"}`} />
          {state ? "Synced" : "Waiting for the editor…"}
        </span>
      </div>
      {state ? (
        <EmbedCreatorPreview guildId={params.guildId} state={state} />
      ) : (
        <p className="text-xs text-slate-600">
          Keep this window open and go back to the Embed Creator tab — it updates automatically as you edit. If this stays blank, that tab
          may have been closed or reloaded.
        </p>
      )}
    </div>
  );
}
