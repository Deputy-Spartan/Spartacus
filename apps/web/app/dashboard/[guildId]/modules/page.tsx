"use client";

import { useEffect, useState } from "react";
import { NAV_SECTIONS, NAV_MODULE_KEYS } from "../../../../components/nav/Sidebar";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { api, type ModuleState } from "../../../../lib/api";
import { usePinnedModules } from "../../../../lib/usePinnedModules";
import Link from "next/link";

// Every card here mirrors a real sidebar link — same grouping, same order —
// so this page reads as "the sidebar, laid out as a grid" rather than a
// second, different module list to keep in sync by hand.
const GRID_SECTIONS = NAV_SECTIONS.filter((s) => s.section && s.section !== "Owner Only");

export default function ModulesPage({ params }: { params: { guildId: string } }) {
  const guildId = params.guildId;
  const [state, setState] = useState<Record<string, ModuleState> | null>(null);
  const { isPinned, togglePin } = usePinnedModules(guildId);

  useEffect(() => {
    api.getModules(guildId).then(setState);
  }, [guildId]);

  async function toggle(moduleKey: string, next: boolean) {
    setState((prev) => (prev ? { ...prev, [moduleKey]: { ...prev[moduleKey], enabled: next } } : prev));
    await api.setModule(guildId, moduleKey, next).catch(() => {
      setState((prev) => (prev ? { ...prev, [moduleKey]: { ...prev[moduleKey], enabled: !next } } : prev));
    });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Modules</h1>
      <p className="text-slate-400 mb-6">Browse every part of Spartacus by category, see what's on at a glance, and pin your daily ones to the top of the sidebar.</p>

      <div className="space-y-8">
        {GRID_SECTIONS.map((section) => (
          <div key={section.section}>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">{section.section}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {section.items.map((item) => {
                const moduleKey = NAV_MODULE_KEYS[item.href];
                const enabled = moduleKey ? state?.[moduleKey]?.enabled ?? false : null;
                const pinned = isPinned(item.href);
                return (
                  <NeonCard key={item.href} className="relative">
                    <button
                      onClick={() => togglePin(item.href)}
                      title={pinned ? "Unpin from sidebar" : "Pin to top of sidebar"}
                      className={`absolute top-3 right-3 text-xs w-6 h-6 flex items-center justify-center rounded transition-colors ${
                        pinned ? "text-neon-blue" : "text-slate-600 hover:text-slate-300"
                      }`}
                    >
                      📌
                    </button>
                    <Link href={`/dashboard/${guildId}${item.href}`} className="flex items-start gap-3 pr-7">
                      <span className="text-lg leading-none mt-0.5">{item.icon}</span>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{item.label}</p>
                        {enabled !== null ? (
                          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                            <span className={`h-2 w-2 rounded-full shrink-0 ${enabled ? "bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.8)]" : "bg-rose-500"}`} />
                            {enabled ? "Enabled" : "Disabled"}
                          </p>
                        ) : (
                          <p className="text-xs text-slate-600 mt-1">Always on</p>
                        )}
                      </div>
                    </Link>
                    {moduleKey && (
                      <div className="mt-3 pt-3 border-t border-white/5 flex justify-end">
                        <ToggleSwitch enabled={enabled ?? false} onChange={(next) => toggle(moduleKey, next)} label={item.label} disabled={!state} />
                      </div>
                    )}
                  </NeonCard>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
