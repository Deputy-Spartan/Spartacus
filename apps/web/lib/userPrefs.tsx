"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, type DashboardTheme, type UserPrefs } from "./api";
import { PREFS_CACHE_KEY as CACHE_KEY, FORGED, FORGED_VAR_NAMES, accentVars, forgedVars } from "./themeScript";

// The theme is saved to the person's account (so it follows them to every
// device) and also remembered in this browser, so the page can paint in the
// right theme before the account answers. `accent` is each theme's own
// accent color, used until the person picks their own. `group` sorts the
// picker: the Classic themes and the Forged A–Z set.
export type ThemeInfo = { id: DashboardTheme; name: string; blurb: string; accent: string; group: "classic" | "forged"; colors?: (typeof FORGED)[number] };
export const FORGED_THEMES: ThemeInfo[] = FORGED.map((t) => ({ id: t[0], name: t[1], blurb: t[2], accent: t[10], group: "forged", colors: t }));
export const THEMES: ThemeInfo[] = [
  ...FORGED_THEMES,
  ...([
  { id: "studio", name: "Studio", blurb: "Solid and bold: an accent bar on every card, filled buttons.", accent: "#7b99bc" },
  { id: "glass", name: "Glass", blurb: "Frosted see-through panels over a colorful glow, with a sheen on hover.", accent: "#7b99bc" },
  { id: "daylight", name: "Daylight", blurb: "A soft light theme: cloudy gray page, darker metal buttons, dark text.", accent: "#7b99bc" },
  { id: "steel", name: "Steel", blurb: "Near-black with brushed steel and an electric blue glow, to match the S logo.", accent: "#4a95ff" },
  { id: "midnight", name: "Midnight", blurb: "True black for OLED phone screens, with a cool cyan glow. Easy on battery.", accent: "#4fd1ff" },
  { id: "dusk", name: "Dusk", blurb: "Soft purple-gray, calm for late nights. Matches the purple group icons.", accent: "#b9a2ff" },
  ] as const).map((t) => ({ ...t, group: "classic" as const })),
];

// Ready-made accent colors to pick from (any other color works too).
export const ACCENTS: Array<{ hex: string; name: string }> = [
  { hex: "#7b99bc", name: "Slate blue" },
  { hex: "#4a95ff", name: "Electric blue" },
  { hex: "#4fd1ff", name: "Cyan" },
  { hex: "#4fd69c", name: "Mint" },
  { hex: "#e0b252", name: "Gold" },
  { hex: "#ff8a3d", name: "Orange" },
  { hex: "#ef5b5b", name: "Red" },
  { hex: "#f472b6", name: "Pink" },
  { hex: "#b9a2ff", name: "Lavender" },
];

export const DEFAULT_PREFS: UserPrefs = { theme: "studio", accent: null, compact: false, reduceMotion: false, displayName: null, glow: "normal", texture: true };

export function applyPrefs(p: Pick<UserPrefs, "theme" | "reduceMotion"> & Partial<Pick<UserPrefs, "accent" | "compact" | "glow" | "texture">>) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = p.theme;
  // Forged themes: the shared look plus this theme's colors.
  FORGED_VAR_NAMES.forEach((k) => root.style.removeProperty(k));
  const forged = forgedVars(p.theme);
  if (forged) {
    root.dataset.look = "forged";
    for (const [k, v] of Object.entries(forged)) root.style.setProperty(k, v);
  } else delete root.dataset.look;
  if (p.glow && p.glow !== "normal") root.dataset.glow = p.glow;
  else delete root.dataset.glow;
  if (p.texture === false) root.dataset.texture = "off";
  else delete root.dataset.texture;
  if (p.reduceMotion) root.dataset.motion = "reduce";
  else delete root.dataset.motion;
  if (p.compact) root.dataset.density = "compact";
  else delete root.dataset.density;
  const a = p.accent ? accentVars(p.accent) : null;
  if (a) {
    root.style.setProperty("--accent-rgb", a.main);
    root.style.setProperty("--accent2-rgb", a.deep);
  } else if (forged) {
    root.style.setProperty("--accent-rgb", forged["--accent-rgb"]);
    root.style.setProperty("--accent2-rgb", forged["--accent2-rgb"]);
  } else {
    root.style.removeProperty("--accent-rgb");
    root.style.removeProperty("--accent2-rgb");
  }
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
        const full = { ...DEFAULT_PREFS, ...p };
        setPrefs(full);
        applyPrefs(full);
        remember(full);
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
        // An API from before accent/compact existed leaves them out; keep this browser's.
        if (saved.accent === undefined) saved.accent = next.accent ?? null;
        if (saved.compact === undefined) saved.compact = next.compact ?? false;
        if (saved.glow === undefined) saved.glow = next.glow ?? "normal";
        if (saved.texture === undefined) saved.texture = next.texture ?? true;
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
