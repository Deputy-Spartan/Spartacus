"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clearToken } from "../../lib/api";
import { THEMES, useUserPrefs } from "../../lib/userPrefs";
import { Icon } from "../ui/AppIcon";

// The avatar in the top bar opens this: who you're signed in as, a quick
// theme switch, Profile, Account settings and Log out.
export function AccountMenu({ user, guildId }: { user: { username: string; avatar: string | null }; guildId: string }) {
  const router = useRouter();
  const { prefs, save } = useUserPrefs();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const name = prefs.displayName || user.username;

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

          <div className="px-3 pt-2 pb-3 border-y border-white/5 my-1">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Theme</p>
            <div className="grid grid-cols-3 gap-1.5">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={prefs.theme === t.id}
                  onClick={() => save({ theme: t.id })}
                  className={[
                    "rounded-lg border px-2 py-1.5 text-xs transition-colors",
                    prefs.theme === t.id ? "border-neon-blue bg-neon-blue/15 text-slate-100" : "border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20",
                  ].join(" ")}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          <Link role="menuitem" href={`/dashboard/${guildId}/account?tab=profile`} onClick={() => setOpen(false)} className={item}>
            <Icon name="user" /> Profile
          </Link>
          <Link role="menuitem" href={`/dashboard/${guildId}/account?tab=account`} onClick={() => setOpen(false)} className={item}>
            <Icon name="settings" /> Account settings
          </Link>
          <div className="border-t border-white/5 my-1" />
          <button role="menuitem" type="button" onClick={logout} className={`${item} text-rose-300 hover:bg-rose-500/10`}>
            <Icon name="log-out" /> Log out
          </button>
        </div>
      )}
    </div>
  );
}
