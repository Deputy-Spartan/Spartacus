// Runs in <head> before the page paints (see app/layout.tsx), so the saved
// theme, accent color and compact mode show straight away instead of
// flashing the default first. Kept out of userPrefs.tsx because that file is
// client-only.
export const PREFS_CACHE_KEY = "spartacus_prefs";

export const THEME_IDS = ["studio", "glass", "daylight", "steel", "midnight", "dusk"] as const;

// The accent color as the two CSS variables every theme reads: the color
// itself and a deeper shade of it (for gradients and pressed states), each
// as "r g b" so Tailwind can add its own opacity (bg-neon-blue/10).
export function accentVars(hex: string): { main: string; deep: string } | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16));
  const d = (v: number) => Math.round(v * 0.78);
  return { main: `${r} ${g} ${b}`, deep: `${d(r)} ${d(g)} ${d(b)}` };
}

export const EARLY_THEME_SCRIPT = `try{var p=JSON.parse(localStorage.getItem("${PREFS_CACHE_KEY}")||"{}");var t=p.theme;if(${JSON.stringify(THEME_IDS)}.indexOf(t)<0)t="studio";var e=document.documentElement;e.dataset.theme=t;if(p.reduceMotion)e.dataset.motion="reduce";if(p.compact)e.dataset.density="compact";var m=/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(p.accent||"");if(m){var c=[m[1],m[2],m[3]].map(function(x){return parseInt(x,16)});e.style.setProperty("--accent-rgb",c.join(" "));e.style.setProperty("--accent2-rgb",c.map(function(v){return Math.round(v*0.78)}).join(" "));}}catch(x){document.documentElement.dataset.theme="studio";}`;
