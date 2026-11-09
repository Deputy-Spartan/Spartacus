"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { api } from "../../lib/api";
import { Icon } from "./AppIcon";

// What each module still needs (from /guilds/:id/setup-status). Loaded on
// every page change, after any save anywhere on the dashboard (adding a
// streamer, a panel, a channel...), and when you come back to the tab, so a
// badge never says "Needs setup" for something that's already done.
export function useSetupStatus(guildId: string) {
  const pathname = usePathname();
  const [status, setStatus] = useState<Record<string, string[]> | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      api
        .getSetupStatus(guildId)
        .then((s) => alive && setStatus(s))
        .catch(() => null);
    // A save can fire several requests in a row; wait for them to settle.
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(load, 400);
    };
    const onFocus = () => document.visibilityState === "visible" && soon();
    load();
    window.addEventListener("spartacus:saved", soon);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      alive = false;
      clearTimeout(timer);
      window.removeEventListener("spartacus:saved", soon);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [guildId, pathname]);
  return status;
}

export type SetupState = "ready" | "needs" | "off";
export const setupState = (enabled: boolean | null | undefined, missing: string[] | undefined): SetupState => (!enabled ? "off" : missing?.length ? "needs" : "ready");

const STYLE: Record<SetupState, string> = {
  ready: "bg-emerald-500/15 text-emerald-300",
  needs: "bg-amber-500/15 text-amber-300",
  off: "bg-white/5 text-slate-400",
};

export function SetupBadge({ state, count = 0 }: { state: SetupState; count?: number }) {
  const icon = state === "ready" ? "circle-check" : state === "needs" ? "circle-alert" : "circle-dashed";
  const text = state === "ready" ? "Ready" : state === "needs" ? `Needs setup · ${count}` : "Off";
  return (
    <span className={`setup-badge setup-${state} inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${STYLE[state]}`}>
      <Icon name={icon} size={13} strokeWidth={2.2} />
      {text}
    </span>
  );
}

// The amber box under a module's header listing exactly what's missing.
export function SetupNotice({ title, missing }: { title: string; missing: string[] }) {
  if (!missing.length) return null;
  return (
    <div className="setup-notice mb-5 flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-3">
      <span className="text-amber-300 mt-0.5">
        <Icon name="circle-alert" size={18} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">Finish setting up {title}</p>
        <ul className="mt-1 list-disc pl-4 text-sm text-slate-300 space-y-0.5">
          {missing.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
