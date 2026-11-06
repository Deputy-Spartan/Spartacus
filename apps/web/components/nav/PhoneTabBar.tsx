"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "../ui/AppIcon";

// Phones only: an app-style bar along the bottom (Home, Modules, Search,
// Account) so the main places are one tap away instead of behind ☰.
export function PhoneTabBar({ guildId }: { guildId: string }) {
  const pathname = usePathname();
  const base = `/dashboard/${guildId}`;
  const tab = (active: boolean) => `flex flex-col items-center gap-0.5 py-1.5 rounded-xl text-[11px] font-semibold transition-colors ${active ? "text-neon-blue" : "text-slate-500"}`;
  const onAccount = pathname.startsWith(`${base}/account`);
  const onHome = pathname === base;
  return (
    <nav className="sp-tabbar md:hidden fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-white/10 bg-base-900/95 backdrop-blur px-2 pt-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))]" aria-label="Main">
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
    </nav>
  );
}
