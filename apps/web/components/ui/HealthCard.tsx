"use client";

import Link from "next/link";
import { MODULE_LABELS, NAV_SECTIONS, type ModuleKey } from "@spartacus/shared";
import type { ModuleState } from "../../lib/api";
import { MODULE_KEY_TO_HREF } from "../nav/Sidebar";
import { AppIcon } from "./AppIcon";
import { NeonCard } from "./NeonCard";
import { useSetupStatus } from "./SetupStatus";

const iconFor = (key: string) => NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.moduleKey === key)?.icon ?? "🧩";

// "How set up is my server?" — of the modules that are on and that have
// something to check, how many have everything they need, and a Fix link
// for each one that doesn't.
export function HealthCard({ guildId, modules }: { guildId: string; modules: Record<string, ModuleState> | null }) {
  const setup = useSetupStatus(guildId);
  if (!setup || !modules) return null;
  const checked = Object.keys(setup).filter((k) => modules[k]?.enabled);
  if (!checked.length) return null;
  const issues = checked.filter((k) => setup[k].length);
  const score = Math.round(((checked.length - issues.length) / checked.length) * 100);
  const r = 26;
  const c = 2 * Math.PI * r;

  return (
    <NeonCard className="mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="relative h-[72px] w-[72px] shrink-0 grid place-items-center" aria-label={`Server health ${score} out of 100`}>
          <svg viewBox="0 0 64 64" className="absolute inset-0" aria-hidden="true">
            <circle cx="32" cy="32" r={r} fill="none" strokeWidth="7" className="stroke-white/10" />
            <circle cx="32" cy="32" r={r} fill="none" strokeWidth="7" strokeLinecap="round" stroke="#7b99bc" strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 32 32)" />
          </svg>
          <span className="text-xl font-extrabold">{score}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Server health</p>
          <p className="text-sm text-slate-400">
            {checked.length - issues.length} of {checked.length} modules you use are fully set up
          </p>
          {issues.length === 0 ? (
            <p className="text-sm text-emerald-400 mt-2">Everything you use is set up.</p>
          ) : (
            <div className="mt-2 grid gap-1.5">
              {issues.map((k) => {
                const href = MODULE_KEY_TO_HREF[k as ModuleKey];
                const row = (
                  <>
                    <AppIcon emoji={iconFor(k)} size={20} />
                    <span className="flex-1 min-w-0 truncate">
                      {MODULE_LABELS[k as ModuleKey] ?? k}: {setup[k][0].charAt(0).toLowerCase() + setup[k][0].slice(1)}
                    </span>
                    {href && <span className="text-amber-300 font-semibold whitespace-nowrap">Fix ›</span>}
                  </>
                );
                return href ? (
                  <Link key={k} href={`/dashboard/${guildId}${href}`} className="flex items-center gap-2 rounded-lg bg-amber-500/[0.08] hover:bg-amber-500/15 px-2.5 py-1.5 text-sm transition-colors">
                    {row}
                  </Link>
                ) : (
                  <div key={k} className="flex items-center gap-2 rounded-lg bg-amber-500/[0.08] px-2.5 py-1.5 text-sm">
                    {row}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </NeonCard>
  );
}
