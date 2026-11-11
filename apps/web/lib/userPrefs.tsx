"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, type DashboardTheme, type UserPrefs } from "./api";
import { PREFS_CACHE_KEY as CACHE_KEY } from "./themeScript";

// The theme is saved to the person's account (so it follows them to every
// device) and also remembered in this browser, so the page can paint in the
// right theme before the account answers.
export const THEMES: Array<{ id: DashboardTheme; name: string; blurb: string }> = [
  { id: "studio", name: "Studio", blurb: "Solid and bold: an accent bar on every card, filled buttons." },
  { id: "glass", name: "Glass", blurb: "Frosted see-through panels over a colorful glow, with a sheen on hover." },
  { id: "daylight", name: "Daylight", blurb: "A light theme: light gray page, white cards, dark text." },
];

export const DEFAULT_PREFS: UserPrefs = { theme: "studio", reduceMotion: false, displayName: null };

export function applyPrefs(p: Pick<UserPrefs, "theme" | "reduceMotion">) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = p.theme;
  if (p.reduceMotion) document.documentElement.dataset.motion = "reduce";
  else delete document.documentElement.dataset.motion;
}

function remember(p: UserPrefs) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(p));
  } catch {
    // Private windows can refuse; the account copy still works.
  }
}

function cached(): UserPrefs {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    // fall through
  }
  return DEFAULT_PREFS;
}

interface PrefsContext {
  prefs: UserPrefs;
  save: (patch: Partial<UserPrefs>) => Promise<string | null>;
}

const Ctx = createContext<PrefsContext>({ prefs: DEFAULT_PREFS, save: async () => null });

export function UserPrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    const local = cached();
    setPrefs(local);
    applyPrefs(local);
    api
      .getMyPrefs()
      .then((p) => {
        setPrefs(p);
        applyPrefs(p);
        remember(p);
      })
      .catch(() => null);
  }, []);

  // Shows the change straight away, then saves it to the account. If the
  // save fails, it goes back and returns the reason.
  const save = useCallback(
    async (patch: Partial<UserPrefs>) => {
      const before = prefs;
      const next = { ...prefs, ...patch };
      setPrefs(next);
      applyPrefs(next);
      try {
        const saved = await api.saveMyPrefs(patch);
        if (!saved || typeof saved !== "object" || !("theme" in saved)) throw new Error((saved as { error?: string })?.error ?? "Couldn't save that.");
        setPrefs(saved);
        applyPrefs(saved);
        remember(saved);
        return null;
      } catch (err) {
        setPrefs(before);
        applyPrefs(before);
        return err instanceof Error ? err.message : "Couldn't save that.";
      }
    },
    [prefs]
  );

  return <Ctx.Provider value={{ prefs, save }}>{children}</Ctx.Provider>;
}

export const useUserPrefs = () => useContext(Ctx);
