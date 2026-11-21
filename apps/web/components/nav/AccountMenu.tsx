"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clearToken } from "../../lib/api";
import { THEMES, useUserPrefs } from "../../lib/userPrefs";
import { Icon } from "../ui/AppIcon";
import { ThemePreview } from "../ui/ThemePreview";

// The avatar in the top bar opens this: who you're signed in as, a Theme row
// (opens preview cards to pick from), Profile, Account settings and Log out.
export function AccountMenu({ user, guildId }: { user: { username: string; avatar: string | null }; guildId: string }) {
  const router = useRouter();
  const { prefs, save } = useUserPrefs();
  const [open, setOpen] = useState(false);
  const [statusUrl, setStatusUrl] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const name = prefs.displayName || user.username;
  // The menu shows either its main list or the theme picker (preview cards).
  const [view, setView] = useState<"main" | "theme">("main");
  const current = THEMES.find((t) => t.id === prefs.theme);
  useEffect(() => {
    if (!open) setView("main");
  }, [open]);

  // The public status page link, if the owner has set one (Owner Only → Front Page).
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/public/front-page`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && typeof j.statusUrl === "string" && setStatusUrl(j.statusUrl))
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent | TouchEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("touchstart", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("touchstart", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  function logout() {
    clearToken();
    router.push("/");
  }

  const item = "flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-white/5 transition-colors text-left";

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Your account"
        className="flex items-center gap-2 rounded-full sm:pr-1 hover:bg-white/5 transition-colors"
      >
        <span className="hidden sm:inline text-sm text-slate-300 pl-2 max-w-[160px] truncate">{name}</span>
        <img src={user.avatar ?? "/default-avatar.png"} alt="" className="h-8 w-8 rounded-full border border-neon-blue" />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-72 rounded-xl border border-white/10 bg-base-900 shadow-2xl shadow-black/50 p-2 z-50">
          <div className="flex items-center gap-3 px-3 py-2.5">
            <img src={user.avatar ?? "/default-avatar.png"} alt="" className="h-10 w-10 rounded-full" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-100 truncate">{name}</p>
              <p className="text-xs text-slate-500 truncate">@{user.username}</p>
            </div>
          </div>

          {view === "theme" ? (
            <div className="border-t border-white/5 mt-1 pt-2">
              <div className="flex items-center justify-between px-1 mb-2">
                <button type="button" onClick={() => setView("main")} className="text-xs text-slate-400 hover:text-slate-100 px-2 py-1 rounded-md hover:bg-white/5">
                  ‹ Back
                </button>
                <p className="text-xs font-semibold text-slate-200">🎨 Theme</p>
                <span className="w-12" />
              </div>
              <p className="px-2 mb-2 text-[11px] text-slate-500">☀ Light → Dark ☾</p>
              <div className="grid grid-cols-2 gap-2 max-h-[55vh] overflow-y-auto px-1 pb-1">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={prefs.theme === t.id}
                    onClick={() => save({ theme: t.id })}
                    className={`text-left rounded-lg border p-1.5 transition-colors ${prefs.theme === t.id ? "border-neon-blue bg-neon-blue/10" : "border-white/10 hover:border-white/25"}`}
                  >
                    <ThemePreview id={t.id} small />
                    <p className="text-[11px] font-semibold text-slate-200 mt-1 leading-tight">
                      {t.name} {prefs.theme === t.id && <span className="text-neon-blue">✓</span>}
                    </p>
                  </button>
                ))}
              </div>
              <Link href={`/dashboard/${guildId}/account?tab=account`} onClick={() => setOpen(false)} className="block text-center text-xs text-neon-blue hover:underline py-2">
                Glow and accent color ›
              </Link>
            </div>
          ) : (
            <>
              <div className="border-t border-white/5 my-1" />
              <button role="menuitem" type="button" onClick={() => setView("theme")} className={item}>
                <span className="w-12 h-9 shrink-0 overflow-hidden rounded-md">
                  <ThemePreview id={prefs.theme} small />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] uppercase tracking-widest text-slate-500">Theme</span>
                  <span className="block truncate">{current?.name ?? "Vesuvius"}</span>
                </span>
                <span className="text-slate-500">›</span>
              </button>
              <div className="border-t border-white/5 my-1" />
            </>
          )}

          {view === "main" && (<>
          <Link role="menuitem" href={`/dashboard/${guildId}/account?tab=profile`} onClick={() => setOpen(false)} className={item}>
            <Icon name="user" /> Profile
          </Link>
          <Link role="menuitem" href={`/dashboard/${guildId}/account?tab=account`} onClick={() => setOpen(false)} className={item}>
            <Icon name="settings" /> Account settings
          </Link>
          {statusUrl && (
            <a role="menuitem" href={statusUrl} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className={item}>
              <Icon name="heart-pulse" /> Status page
            </a>
          )}
          <div className="border-t border-white/5 my-1" />
          <button role="menuitem" type="button" onClick={logout} className={`${item} text-rose-300 hover:bg-rose-500/10`}>
            <Icon name="log-out" /> Log out
          </button>
          </>)}
        </div>
      )}
    </div>
  );
}
