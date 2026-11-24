"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { MODULE_LABELS, MODULE_TIER, NAV_MODULE_KEYS, NAV_SECTIONS, TIER_INFO, UNLISTED_MODULES, tierForPath } from "@spartacus/shared";
import { isLocked, useGuildPlan } from "../../../../lib/useGuildPlan";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { AppIcon } from "../../../../components/ui/AppIcon";
import { SetupBadge, setupState, useSetupStatus } from "../../../../components/ui/SetupStatus";
import { setModuleEnabled, useModules } from "../../../../lib/useModules";
import { usePinnedModules } from "../../../../lib/usePinnedModules";
import { GroupCards } from "../../../../components/nav/GroupCards";

// Every group from the sidebar, each one a card that opens to show its pages
// as one-line rows: name, status, pin and on/off switch. Closed, a group
// shows how many of its pages are on, so the whole dashboard fits on a screen
// instead of one tall card per page.
const ALL_GROUPS = NAV_SECTIONS.filter((s) => s.section && s.section !== "Owner Only");
const EXTRAS = "Commands & Background Features";
const OPEN_KEY = "spartacus:modules-open";

function ModulesContent({ guildId }: { guildId: string }) {
  const state = useModules(guildId);
  const { isPinned, togglePin } = usePinnedModules(guildId);
  const setup = useSetupStatus(guildId);
  // A link with ?section= (the search box and older bookmarks use it) shows
  // just that group, already open.
  const sectionFilter = useSearchParams().get("section");
  const groups = sectionFilter ? ALL_GROUPS.filter((s) => s.section === sectionFilter) : ALL_GROUPS;

  // One group is open at a time; opening another closes it. Which one is
  // remembered on this device.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "{}") as Record<string, boolean>;
      const first = Object.keys(saved).find((k) => saved[k]);
      setOpen(first ? { [first]: true } : {});
    } catch {
      /* private mode */
    }
  }, []);
  function remember(next: Record<string, boolean>) {
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
  }
  const flip = (name: string, el?: HTMLElement) => {
    const opening = !open[name];
    remember(opening ? { [name]: true } : {});
    // Closing the group above moves this one up the page, so keep it in view.
    if (opening && el) requestAnimationFrame(() => {
      if (el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  };
  const isOpen = (name: string) => !!sectionFilter || !!open[name];

  const toggle = (moduleKey: string, next: boolean) => void setModuleEnabled(guildId, moduleKey, next).catch(() => null);
  // Paid plans: a page this server's plan doesn't cover shows 🔒 instead of its switch.
  const plan = useGuildPlan(guildId);
  const lockFor = (href: string) => {
    const tier = tierForPath(href, (h) => NAV_MODULE_KEYS[h]);
    // (Before plans are switched on, only the page itself guards the Stream Deck.)
    return tier && isLocked(plan, tier, true) ? tier : null;
  };

  return (
    <div>
      {sectionFilter && (
        <Link href={`/dashboard/${guildId}/modules`} className="text-xs text-neon-blue hover:text-neon-purple mb-3 inline-block">
          ← All groups
        </Link>
      )}
      <div className="mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold mb-1">{sectionFilter ?? "Modules"}</h1>
          <p className="text-slate-400">Switch features on or off. Open a group to see what&apos;s inside, and pin the pages you use most to the top of the sidebar.</p>
        </div>
      </div>
      {groups.length === 0 && <p className="text-sm text-slate-500">No group matches &quot;{sectionFilter}&quot;.</p>}

      <div className={`grid grid-cols-1 gap-3 items-start ${sectionFilter ? "" : "lg:grid-cols-2"}`}>
        {groups.map((group) => {
          const name = group.section as string;
          const gated = group.items.filter((i) => i.moduleKey);
          const on = gated.filter((i) => state?.[i.moduleKey!]?.enabled).length;
          const needs = gated.filter((i) => state?.[i.moduleKey!]?.enabled && setup?.[i.moduleKey!]?.length).length;
          const shown = isOpen(name);
          return (
            <NeonCard key={name} className="!p-0 overflow-hidden">
              <button
                type="button"
                onClick={(e) => !sectionFilter && flip(name, e.currentTarget)}
                aria-expanded={shown}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
              >
                <AppIcon emoji={group.icon ?? group.items[0]?.icon ?? "🧩"} size={34} />
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold truncate">{name}</span>
                  <span className="block text-xs text-slate-500 truncate">
                    {state ? `${on} of ${gated.length} on` : "Loading…"}
                    {needs > 0 && <span className="text-amber-400"> · {needs} need{needs === 1 ? "s" : ""} setup</span>}
                    {group.description && <span className="hidden sm:inline"> · {group.description}</span>}
                  </span>
                </span>
                {!sectionFilter && <span className={`text-slate-500 text-xs transition-transform ${shown ? "rotate-180" : ""}`}>▼</span>}
              </button>
              {shown && (
                <ul className="border-t border-white/5 divide-y divide-white/5">
                  {group.items.map((item) => {
                    const moduleKey = NAV_MODULE_KEYS[item.href];
                    const enabled = moduleKey ? (state?.[moduleKey]?.enabled ?? false) : null;
                    const pinned = isPinned(item.href);
                    return (
                      <li key={item.href} className="group flex items-center gap-2 pl-4 pr-3 py-2">
                        <Link href={`/dashboard/${guildId}${item.href}`} className="flex flex-1 min-w-0 items-center gap-3 py-1 text-sm text-slate-200 hover:text-neon-blue">
                          <AppIcon emoji={item.icon} size={24} />
                          <span className="min-w-0 truncate">{item.label}</span>
                        </Link>
                        {enabled !== null ? (
                          <span className="hidden sm:block shrink-0">
                            <SetupBadge state={setupState(enabled, setup?.[moduleKey!])} count={setup?.[moduleKey!]?.length ?? 0} />
                          </span>
                        ) : (
                          <span className="shrink-0 text-xs text-slate-600">Always on</span>
                        )}
                        <button
                          type="button"
                          onClick={() => togglePin(item.href)}
                          title={pinned ? "Unpin from sidebar" : "Pin to top of sidebar"}
                          className={`shrink-0 text-xs w-7 h-7 flex items-center justify-center rounded transition-colors ${pinned ? "text-neon-blue" : "text-slate-600 hover:text-slate-300"}`}
                        >
                          📌
                        </button>
                        {lockFor(item.href) ? (
                          <Link href={`/dashboard/${guildId}/plans`} className="shrink-0 text-xs text-amber-300 hover:text-amber-200" title={`Needs ${TIER_INFO[lockFor(item.href)!].name}`}>
                            🔒 {TIER_INFO[lockFor(item.href)!].name}
                          </Link>
                        ) : (
                          moduleKey && <ToggleSwitch enabled={enabled ?? false} onChange={(next) => toggle(moduleKey, next)} label={item.label} disabled={!state} />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </NeonCard>
          );
        })}

        {!sectionFilter && (
          <NeonCard className="!p-0 overflow-hidden">
            <button type="button" onClick={(e) => flip(EXTRAS, e.currentTarget)} aria-expanded={isOpen(EXTRAS)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
              <AppIcon emoji="🧩" size={34} />
              <span className="flex-1 min-w-0">
                <span className="block font-semibold truncate">{EXTRAS}</span>
                <span className="block text-xs text-slate-500 truncate">
                  {state ? `${UNLISTED_MODULES.filter(({ key }) => state[key]?.enabled).length} of ${UNLISTED_MODULES.length} on` : "Loading…"}
                  <span className="hidden sm:inline"> · Features with no settings page of their own.</span>
                </span>
              </span>
              <span className={`text-slate-500 text-xs transition-transform ${isOpen(EXTRAS) ? "rotate-180" : ""}`}>▼</span>
            </button>
            {isOpen(EXTRAS) && (
              <ul className="border-t border-white/5 divide-y divide-white/5">
                {UNLISTED_MODULES.map(({ key, description }) => (
                  <li key={key} className="flex items-center gap-3 pl-4 pr-3 py-2.5">
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-slate-200 truncate">{MODULE_LABELS[key]}</span>
                      <span className="block text-xs text-slate-500 truncate">{description}</span>
                    </span>
                    {MODULE_TIER[key] && isLocked(plan, MODULE_TIER[key]!) ? (
                      <Link href={`/dashboard/${guildId}/plans`} className="shrink-0 text-xs text-amber-300 hover:text-amber-200">
                        🔒 {TIER_INFO[MODULE_TIER[key]!].name}
                      </Link>
                    ) : (
                      <ToggleSwitch enabled={state?.[key]?.enabled ?? false} onChange={(next) => toggle(key, next)} label={MODULE_LABELS[key]} disabled={!state} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </NeonCard>
        )}
      </div>
    </div>
  );
}

// A group's button in the sidebar links here with ?section=, which shows that
// group's page of cards instead of the list of every group.
function ModulesOrGroup({ guildId }: { guildId: string }) {
  const section = useSearchParams().get("section");
  return section ? <GroupCards guildId={guildId} section={section} /> : <ModulesContent guildId={guildId} />;
}

export default function ModulesPage({ params }: { params: { guildId: string } }) {
  return (
    <Suspense fallback={<p className="text-slate-500 text-sm">Loading…</p>}>
      <ModulesOrGroup guildId={params.guildId} />
    </Suspense>
  );
}
