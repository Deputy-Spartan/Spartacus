"use client";

import { useEffect, useState } from "react";
import { api, type LiveStrip as LiveStripData } from "../../lib/api";

// A row across the top of the Overview page: members, how many are online,
// the change since yesterday, and who's live right now. Refreshes every
// minute while the page is open.
export function LiveStrip({ guildId }: { guildId: string }) {
  const [data, setData] = useState<LiveStripData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .getLiveStrip(guildId)
        .then((d) => {
          if (!alive) return;
          setData(d);
          setFailed(false);
        })
        .catch(() => alive && setFailed(true));
    load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [guildId]);

  if (failed && !data) return null;
  const n = (v: number | null | undefined) => (v === null || v === undefined ? "…" : v.toLocaleString());
  const change = data?.memberChange;
  const pill = "flex items-center gap-2 rounded-xl border border-white/10 bg-base-900 px-3 py-2 text-sm whitespace-nowrap";

  return (
    <div className="mb-6 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Your server right now">
      <div className={pill}>
        <span className="text-slate-500">Members</span>
        <b>{n(data?.memberCount)}</b>
      </div>
      <div className={pill}>
        <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
        <span className="text-slate-500">Online</span>
        <b>{n(data?.onlineCount)}</b>
      </div>
      <div className={pill} title="Change in members since about this time yesterday">
        <span className="text-slate-500">Today</span>
        <b className={change ? (change > 0 ? "text-emerald-400" : "text-rose-400") : undefined}>
          {change === null || change === undefined ? "–" : change > 0 ? `+${change}` : String(change)}
        </b>
      </div>
      <div className={pill}>
        <span className={`h-2 w-2 rounded-full ${data?.liveNow.length ? "bg-rose-500 animate-pulse" : "bg-slate-600"}`} aria-hidden="true" />
        <span className="text-slate-500">Live now</span>
        {data && data.liveNow.length > 0 ? (
          <b className="truncate max-w-[16rem]">
            {data.liveNow
              .slice(0, 3)
              .map((l) => `${l.name}${l.friend ? " (friend)" : ""}`)
              .join(", ")}
            {data.liveNow.length > 3 ? ` +${data.liveNow.length - 3}` : ""}
          </b>
        ) : (
          <b className="text-slate-400">{data ? "Nobody" : "…"}</b>
        )}
      </div>
    </div>
  );
}
