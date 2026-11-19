"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_SECTIONS, OWNER_NAV_SECTION } from "@spartacus/shared";
import { Icon, AppIcon } from "../ui/AppIcon";
import { usePinnedModules } from "../../lib/usePinnedModules";
import { useNavLayout } from "../../lib/navLayout";

const ALL_ITEMS = [...NAV_SECTIONS, OWNER_NAV_SECTION].flatMap((s) => s.items).filter((i) => i.href);

// Phones only: an app-style bar along the bottom (Home, Modules, Search,
// Account) so the main places are one tap away instead of behind ☰. Above it
// sits the dock: your pinned pages, plus a button to pin the page you're on.
// Pins are the same ones as the sidebar's Pinned group and follow your account.
export function PhoneTabBar({ guildId }: { guildId: string }) {
  const pathname = usePathname();
  const base = `/dashboard/${guildId}`;
  const rel = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  const { pinned, isPinned, togglePin } = usePinnedModules(guildId);
  const { pageLabel } = useNavLayout();
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  const pins = useMemo(() => pinned.map((href) => ALL_ITEMS.find((i) => i.href === href)).filter((i): i is (typeof ALL_ITEMS)[number] => !!i), [pinned]);
  // The page you're on, if it's one that can be pinned.
  const here = useMemo(() => ALL_ITEMS.find((i) => rel === i.href || rel.startsWith(`${i.href}/`)), [rel]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [rel]);

  const tab = (active: boolean) => `flex flex-col items-center gap-0.5 py-1.5 rounded-xl text-[11px] font-semibold transition-colors ${active ? "text-neon-blue" : "text-slate-500"}`;
  const onAccount = pathname.startsWith(`${base}/account`);
  const onHome = pathname === base;
  const showDock = pins.length > 0 || !!here;

  return (
    <nav className="sp-tabbar md:hidden fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-base-900/95 backdrop-blur pb-[calc(0.5rem+env(safe-area-inset-bottom))]" aria-label="Main">
      {showDock && (
        <div className="flex items-center gap-1.5 overflow-x-auto px-3 pt-2 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Pinned pages">
          {pins.map((item) => {
            const active = rel === item.href || rel.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={`${base}${item.href}`}
                ref={active ? activeRef : undefined}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${
                  active ? "border-neon-blue/60 text-neon-blue bg-base-800" : "border-white/10 text-slate-300"
                }`}
              >
                <AppIcon emoji={item.icon} size={16} />
                {pageLabel(item.href, item.label)}
              </Link>
            );
          })}
          {here && (
            <button
              type="button"
              onClick={() => togglePin(here.href)}
              className="shrink-0 rounded-lg border border-dashed border-white/15 px-2.5 py-1 text-xs text-slate-400 whitespace-nowrap"
            >
              {isPinned(here.href) ? "★ Unpin this page" : "☆ Pin this page"}
            </button>
          )}
        </div>
      )}
      <div className="grid grid-cols-4 px-2 pt-1.5">
        <Link href={base} className={tab(onHome)} aria-current={onHome ? "page" : undefined}>
          <Icon name="layout-dashboard" size={21} />
          Home
        </Link>
        <Link href={`${base}/modules`} className={tab(!onHome && !onAccount)}>
          <Icon name="layout-grid" size={21} />
          Modules
        </Link>
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("spartacus:open-command-palette"))} className={tab(false)}>
          <Icon name="search" size={21} />
          Search
        </button>
        <Link href={`${base}/account?tab=profile`} className={tab(onAccount)} aria-current={onAccount ? "page" : undefined}>
          <Icon name="user" size={21} />
          Account
        </Link>
      </div>
    </nav>
  );
}
