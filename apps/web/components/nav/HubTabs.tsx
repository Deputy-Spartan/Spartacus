"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navSectionForPath } from "@spartacus/shared";
import { useModules } from "../../lib/useModules";
import { hoverPrefetch } from "../../lib/prefetch";
import { AppIcon } from "../ui/AppIcon";
import { useSetupStatus } from "../ui/SetupStatus";

// The row of tabs across the top of every page that belongs to a group
// (Moderation, Streaming and so on): one tab per page in that group, so a
// related setting is one click away instead of back through the menu.
//
// Each tab is still its own page with its own address, so links, bookmarks,
// the page guides and the pin button all keep working, and a tab only loads
// its data when it's opened. The dot shows whether that page's module is on.
export function HubTabs({ guildId }: { guildId: string }) {
  const pathname = usePathname();
  const base = `/dashboard/${guildId}`;
  const rel = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  const hub = navSectionForPath(rel);
  const modules = useModules(guildId);
  const setup = useSetupStatus(guildId);
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  // On a phone the row scrolls sideways; bring the open tab into view.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  // A group with a single page (the Economy Hub) has nothing to switch between.
  if (!hub || hub.items.length < 2) return null;

  return (
    <nav aria-label={`${hub.section} pages`} className="mb-5">
      <div className="flex items-center gap-2 mb-2">
        {hub.icon && <AppIcon emoji={hub.icon} size={18} />}
        <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">{hub.section}</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {hub.items.map((item) => {
          const href = `${base}${item.href}`;
          const active = rel === item.href || rel.startsWith(`${item.href}/`);
          const enabled = item.moduleKey && modules ? (modules[item.moduleKey]?.enabled ?? false) : null;
          const needsSetup = !!(item.moduleKey && enabled && setup?.[item.moduleKey]?.length);
          return (
            <Link
              key={item.href}
              href={href}
              ref={active ? activeRef : undefined}
              aria-current={active ? "page" : undefined}
              {...hoverPrefetch(guildId, href)}
              className={[
                "shrink-0 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
                active ? "sp-hubtab-on border-transparent font-semibold" : "border-white/10 text-slate-400 hover:text-slate-100 hover:bg-base-800/60",
              ].join(" ")}
            >
              {enabled !== null && (
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${!enabled ? "bg-rose-500" : needsSetup ? "bg-amber-400" : "bg-emerald-400"}`}
                  title={!enabled ? "Off" : needsSetup ? "Needs setup" : "On"}
                />
              )}
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
