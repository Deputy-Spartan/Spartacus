// Runs in <head> before the page paints (see app/layout.tsx), so the saved
// theme, accent color and compact mode show straight away instead of
// flashing the default first. Kept out of userPrefs.tsx because that file is
// client-only.
export const PREFS_CACHE_KEY = "spartacus_prefs";

// Metal "Forged" theme colors. Empty: the user went back to the original
// themes on 2026-11-21. The rules for them (data-look="forged" in
// globals.css) stay in place but do nothing while this list is empty.
// [id, name, blurb, page, raised, metal light, metal mid, metal dark, card top, card bottom, accent, button color?]
export const FORGED: Array<[string, string, string, string, string, string, string, string, string, string, string, string?]> = [];
export const LIGHT_THEMES: string[] = [];
export const DEFAULT_THEME = "studio";

// The original themes.
export const THEME_IDS: string[] = ["studio", "glass", "daylight", "steel", "midnight", "dusk", ...FORGED.map((t) => t[0])];

const rgbOf = (hex: string) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [m[1], m[2], m[3]].map((x) => parseInt(x, 16)) : [128, 128, 128];
};

// The CSS variables one Forged theme sets (theme colors, shared surface tokens and the metal).
export function forgedVars(id: string): Record<string, string> | null {
  const t = FORGED.find((x) => x[0] === id);
  if (!t) return null;
  const [, , , page, raised, hi, mid, lo, top, bot, accent, btn] = t;
  const a = rgbOf(accent);
  return {
    "--f-hi": hi, "--f-mid": mid, "--f-lo": lo, "--f-top": top, "--f-bot": bot, "--f-raised": raised,
    // A second button color only for themes that have one; others follow the accent (yours or the theme's).
    ...(btn ? { "--f-btn-rgb": rgbOf(btn).join(" ") } : {}),
    "--accent-rgb": a.join(" "), "--accent2-rgb": a.map((v) => Math.round(v * 0.78)).join(" "),
    "--t-page": page, "--t-950": page, "--t-900": raised, "--t-800": top, "--t-700": lo,
    "--t-card": bot, "--t-card-hi": top, "--t-line": lo, "--t-side": raised, "--t-header": `rgb(${rgbOf(page).join(" ")} / 0.85)`,
    "--m-top": top, "--m-bot": bot,
    ...(LIGHT_THEMES.includes(id)
      ? { "--m-light": "rgba(255,255,255,.7)", "--m-hl": "rgba(255,255,255,.5)", "--m-dark": "rgba(60,45,25,.18)", "--m-text": "#2b241b" }
      : { "--m-light": "rgba(255,255,255,.1)", "--m-hl": "rgba(255,255,255,.05)", "--m-dark": "rgba(0,0,0,.6)", "--m-text": "#cfd6df" }),
  };
}
export const FORGED_VAR_NAMES = Object.keys(forgedVars(FORGED[0]?.[0] ?? "") ?? {});

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

// Each Forged theme's variables, for the early script.
const FORGED_JSON = JSON.stringify(Object.fromEntries(FORGED.map((x) => [x[0], forgedVars(x[0])])));

export const EARLY_THEME_SCRIPT = `try{var p=JSON.parse(localStorage.getItem("${PREFS_CACHE_KEY}")||"{}");var t=p.theme;if(${JSON.stringify(THEME_IDS)}.indexOf(t)<0)t="${DEFAULT_THEME}";var e=document.documentElement;e.dataset.theme=t;var F=${FORGED_JSON};if(F[t]){e.dataset.look="forged";for(var k in F[t])e.style.setProperty(k,F[t][k]);}if(${JSON.stringify(LIGHT_THEMES)}.indexOf(t)>=0)e.dataset.tone="light";if(p.glow&&p.glow!=="normal")e.dataset.glow=p.glow;if(p.texture===false)e.dataset.texture="off";if(p.reduceMotion)e.dataset.motion="reduce";if(p.compact)e.dataset.density="compact";var m=/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(p.accent||"");if(m){var c=[m[1],m[2],m[3]].map(function(x){return parseInt(x,16)});e.style.setProperty("--accent-rgb",c.join(" "));e.style.setProperty("--accent2-rgb",c.map(function(v){return Math.round(v*0.78)}).join(" "));}}catch(x){document.documentElement.dataset.theme="${DEFAULT_THEME}";}`;
