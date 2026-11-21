// Runs in <head> before the page paints (see app/layout.tsx), so the saved
// theme, accent color and compact mode show straight away instead of
// flashing the default first. Kept out of userPrefs.tsx because that file is
// client-only.
export const PREFS_CACHE_KEY = "spartacus_prefs";

// The six gladiator themes, light to dark (picked on the theme page). All share
// one set of rules (data-look="forged") and differ in these colors, set as CSS
// variables on <html>. Capua and Vesuvius are flat (the "Sleek" look); the four
// in between are smooth metal. Capua and Colosseum are light (data-tone="light").
// [id, name, blurb, page, raised, metal light, metal mid, metal dark, card top, card bottom, accent, button color?]
export const FORGED: Array<[string, string, string, string, string, string, string, string, string, string, string, string?]> = [
  ["capua", "Capua", "Light: white marble and gold. Clean and flat.", "#ece8e1", "#f6f3ee", "#ffffff", "#d6cfc3", "#c9bfae", "#ffffff", "#f5f1ea", "#a8242f", "#d9a93f"],
  ["colosseum", "Colosseum", "Warm arena sandstone, bronze buttons, deep red.", "#cfc5b3", "#dbd2c2", "#f3ecdf", "#b4a58c", "#a89878", "#ebe3d5", "#ddd3c2", "#8c2f2f", "#c98a52"],
  ["thraex", "Thraex", "Dark bronze helmet, gold buttons, teal glow.", "#2a241f", "#332c26", "#f0c79a", "#8a6240", "#4a3a2c", "#3d352d", "#2e2721", "#39c4d6", "#e2b54f"],
  ["crixus", "Crixus", "Dark iron with Roman red glow and gold buttons.", "#15110f", "#1d1715", "#e3cdd0", "#6e4c52", "#2e2220", "#2a201e", "#1b1513", "#d9343f", "#e2b54f"],
  ["murmillo", "Murmillo", "Smooth steel like the logo, gold buttons, blue glow.", "#0b0d11", "#12161d", "#cfd8e3", "#6b7685", "#1d232d", "#1f2630", "#141921", "#5aa9ff", "#e2b54f"],
  ["vesuvius", "Vesuvius", "Dark: flat black panels, thin edges, gold.", "#060607", "#0d0d0f", "#2a2a30", "#202026", "#18181c", "#151517", "#101012", "#e2b54f", "#e2b54f"],
];
export const LIGHT_THEMES = ["capua", "colosseum"];
export const DEFAULT_THEME = "vesuvius";

export const THEME_IDS = FORGED.map((t) => t[0]);

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
export const FORGED_VAR_NAMES = Object.keys(forgedVars("murmillo") ?? {}); // has every variable, button color included

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
