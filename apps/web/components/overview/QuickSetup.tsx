"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ModuleKey } from "@spartacus/shared";
import { NeonCard } from "../ui/NeonCard";
import { useModules } from "../../lib/useModules";
import { useSetupStatus } from "../ui/SetupStatus";

// The five things to set up first on a new server, on the Overview page. A
// step is done when its module is on and has nothing left to set up. The
// card hides itself once all five are done, or when you close it.
const STEPS: Array<{ key: ModuleKey; href: string; title: string; why: string }> = [
  { key: "WELCOME", href: "/welcome", title: "Greet new members", why: "A welcome message so people know where to start." },
  { key: "RULES_GATE", href: "/rules-gate", title: "Post your rules", why: "Members agree to the rules before they can chat." },
  { key: "MODERATION", href: "/moderation", title: "Set up moderation", why: "Warnings, mutes and a log channel for your staff." },
  { key: "TICKETS", href: "/tickets", title: "Let members reach staff", why: "Private help tickets instead of DMs." },
  { key: "STREAM_ALERTS", href: "/stream-alerts", title: "Announce when you go live", why: "A post in Discord every time you start streaming." },
];

export function QuickSetup({ guildId }: { guildId: string }) {
  const modules = useModules(guildId);
  const setup = useSetupStatus(guildId);
  const storeKey = `spartacus:quick-setup-hidden:${guildId}`;
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(storeKey) === "1");
    } catch {
      /* private mode */
    }
  }, [storeKey]);

  if (!modules || hidden) return null;
  const done = (k: ModuleKey) => !!modules[k]?.enabled && !setup?.[k]?.length;
  const count = STEPS.filter((s) => done(s.key)).length;
  if (count === STEPS.length) return null;

  return (
    <NeonCard className="mb-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="font-semibold">Quick setup</p>
          <p className="text-xs text-slate-500">
            {count} of {STEPS.length} done. These are the first things most servers set up.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem(storeKey, "1");
            } catch {
              /* private mode */
            }
          }}
          className="text-xs text-slate-500 hover:text-slate-300 shrink-0"
        >
          Hide
        </button>
      </div>
      <div className="h-1.5 rounded-full bg-base-800 overflow-hidden mb-3">
        <div className="h-full bg-neon-blue transition-all" style={{ width: `${(count / STEPS.length) * 100}%` }} />
      </div>
      <ol className="space-y-1.5">
        {STEPS.map((s) => {
          const ok = done(s.key);
          const on = !!modules[s.key]?.enabled;
          return (
            <li key={s.key}>
              <Link href={`/dashboard/${guildId}${s.href}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-base-800/60">
                <span
                  className={`h-6 w-6 shrink-0 rounded-full grid place-items-center text-xs font-bold ${ok ? "bg-emerald-500/20 text-emerald-400" : "border border-white/15 text-slate-500"}`}
                  aria-hidden="true"
                >
                  {ok ? "✓" : ""}
                </span>
                <span className="flex-1 min-w-0">
                  <span className={`block text-sm ${ok ? "text-slate-500 line-through" : "font-medium"}`}>{s.title}</span>
                  {!ok && <span className="block text-xs text-slate-500">{on ? "Turned on, but something still needs setting up." : s.why}</span>}
                </span>
                {!ok && <span className="text-xs font-semibold text-neon-blue shrink-0">Set up ›</span>}
              </Link>
            </li>
          );
        })}
      </ol>
    </NeonCard>
  );
}
