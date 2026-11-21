// Runs in <head> before the page paints (see app/layout.tsx), so the saved
// theme, accent color and compact mode show straight away instead of
// flashing the default first. Kept out of userPrefs.tsx because that file is
// client-only.
export const PREFS_CACHE_KEY = "spartacus_prefs";

// The Forged themes (A–Z, from the theme picks page): metal-edged cards, a glow
// line on top, brushed texture. All share one set of rules (data-look="forged")
// and differ only in these colors, set as CSS variables on <html>.
// [id, name, blurb, page, raised, metal light, metal mid, metal dark, card top, card bottom, accent, button color?]
export const FORGED: Array<[string, string, string, string, string, string, string, string, string, string, string, string?]> = [
  // Two picked looks first, with a few extra rules each in globals.css.
  ["gladiator", "★ Gladiator", "Smooth steel, gold buttons, blue switches. No lines.", "#0b0d11", "#12161d", "#cfd8e3", "#6b7685", "#1d232d", "#1f2630", "#141921", "#5aa9ff", "#e2b54f"],
  ["sleek", "★ Sleek", "Clean and modern: flat dark panels, thin edges, white buttons.", "#0a0a0c", "#111114", "#2c2c33", "#222228", "#1a1a1f", "#17171b", "#121215", "#5b8cff", "#f2f4f7"],
  ["forged", "A · Forged Steel", "Brushed metal with the logo's blue glow.", "#0d1016", "#141922", "#c9d3df", "#5d6979", "#1d232d", "#222a35", "#151a22", "#5aa9ff"],
  ["arc", "B · Arc Blue", "Deep navy glass with a strong neon blue.", "#070b16", "#0c1430", "#7fb6ff", "#2a4c86", "#0d1730", "#1c2c56", "#0c142a", "#3d8bff"],
  ["gunmetal", "C · Gunmetal Gold", "Dark steel with gold trim.", "#0e0f11", "#17181b", "#e7c873", "#6f6448", "#1f1e1b", "#24262a", "#17181b", "#e2b54f"],
  ["crown", "D · Steel Crown", "Forged Steel with gold buttons.", "#0d1016", "#141922", "#c9d3df", "#5d6979", "#1d232d", "#222a35", "#151a22", "#5aa9ff", "#e2b54f"],
  ["sapphire", "E · Sapphire Gold", "Navy glass with gold edges and buttons.", "#070b16", "#0d1630", "#f0d68a", "#4a5f8f", "#0d1730", "#1a2850", "#0b1228", "#3d8bff", "#d9a93f"],
  ["chrome", "F · Polished Chrome", "Mirror-bright metal with an icy white glow.", "#11151c", "#1c232e", "#ffffff", "#8d9aab", "#2a323e", "#2c3542", "#1b222c", "#8fd3ff"],
  ["ice", "G · Obsidian Ice", "Almost black with a sharp cyan glow.", "#05070a", "#0b1016", "#b9f3ff", "#3d5866", "#0d141a", "#121a22", "#090d12", "#19d3ff"],
  ["bronze", "H · Spartan Bronze", "Bronze helmet metal, teal glow, copper buttons.", "#0f0e0d", "#1a1715", "#f0c79a", "#8a6240", "#231b15", "#2a241f", "#191512", "#39c4d6", "#c98a52"],
  ["royal", "I · Royal Steel", "Cool steel with a violet glow.", "#0c0c14", "#151627", "#d4d6ea", "#5f6385", "#1b1c2e", "#23243a", "#161727", "#7c6cff"],
  ["crimson", "J · Crimson Legion", "Steel with a deep red glow.", "#100c0d", "#1b1416", "#e3cdd0", "#6e4c52", "#241a1c", "#2a2023", "#191315", "#e0313f"],
  ["emerald", "K · Emerald Guard", "Steel with a rich green glow.", "#0b100e", "#131c18", "#cfe3da", "#4f6e61", "#18231e", "#1f2c26", "#131b17", "#22c58b"],
  ["midgold", "L · Midnight Gold", "Pure black with glowing gold.", "#060606", "#0f0e0b", "#ffe7a3", "#7a6633", "#16140e", "#17150f", "#0b0a08", "#f2c14e"],
  ["storm", "M · Storm Grey", "Soft grey metal, calm blue light.", "#121418", "#1b1f25", "#c3cad3", "#5b636e", "#22272e", "#262b33", "#1a1e24", "#7aa6d9"],
  ["frost", "N · Frost Steel", "Pale frosted metal, white-blue light.", "#131a22", "#1d2833", "#f2f8ff", "#93a7bb", "#2a3644", "#2e3b4a", "#1f2a36", "#a9dcff"],
  ["plasma", "O · Plasma", "Pink energy glow with blue buttons.", "#0b0a12", "#151324", "#e2d8f5", "#5e5782", "#1c1a2e", "#221f38", "#151325", "#e14bff", "#3d9bff"],
  ["copper", "P · Copper Forge", "Copper metal and orange forge light.", "#100c0a", "#1b1410", "#f3c2a0", "#8a5636", "#241912", "#2a1f18", "#1a130f", "#ff8a3d"],
  ["ocean", "Q · Ocean Steel", "Steel with a deep teal glow.", "#081012", "#0f1b1f", "#c6e4e8", "#466a70", "#14252a", "#1a2c31", "#101d21", "#1fb5c4"],
  ["blackout", "R · Blackout", "Almost all black, thin red edges.", "#040404", "#0a0a0b", "#9a9aa0", "#3a3a40", "#111113", "#141416", "#0a0a0b", "#ff3b3b"],
  ["spartan", "S · Spartan Red & Gold", "Crimson glow with gold buttons.", "#110c0c", "#1d1414", "#f0d68a", "#7a4a4a", "#261a1a", "#2c1f1f", "#1b1313", "#d9343f", "#d9a93f"],
  ["titanium", "T · Titanium", "Grey titanium with a warm white glow.", "#121212", "#1c1c1d", "#f4f1ea", "#7c7a75", "#252524", "#29292a", "#1b1b1c", "#e8dcc4"],
  ["cobaltbronze", "U · Cobalt Bronze", "Navy blue light with bronze buttons.", "#080c16", "#101830", "#f0c79a", "#4a5f8f", "#121b33", "#1b2748", "#0f172d", "#3d7bff", "#c98a52"],
  ["jade", "V · Jade Steel", "Steel with a soft jade glow.", "#0c1110", "#141c1a", "#d3e6df", "#55716a", "#1a2422", "#212d2a", "#151d1b", "#4fd1a5"],
  ["wolf", "W · Wolf Grey", "Dark wolf-grey metal with amber light.", "#0f1012", "#181a1d", "#d6d2c8", "#64615a", "#202226", "#25272b", "#18191c", "#f5a524"],
  ["arena", "X · Neon Arena", "Purple glow with cyan buttons.", "#0a0812", "#141024", "#d8cff5", "#5a4e86", "#1b1630", "#221c3c", "#151127", "#8b5cff", "#19c8e6"],
  ["rose", "Y · Silver Rose", "Bright silver with a rose glow.", "#121014", "#1d1a20", "#f3e9ef", "#86737f", "#272228", "#2c262d", "#1c181d", "#ff6f9e"],
  ["shadow", "Z · Shadow Steel", "Very dark and quiet, a dim silver shine.", "#08090b", "#0f1114", "#a7afba", "#3e444d", "#14171b", "#16191d", "#0d0f12", "#8a96a8"],
];

export const THEME_IDS = ["studio", "glass", "daylight", "steel", "midnight", "dusk", ...FORGED.map((t) => t[0])] as const;

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
    "--m-top": top, "--m-bot": bot, "--m-light": "rgba(255,255,255,.1)", "--m-hl": "rgba(255,255,255,.05)", "--m-dark": "rgba(0,0,0,.6)", "--m-text": "#cfd6df",
  };
}
export const FORGED_VAR_NAMES = Object.keys(forgedVars("crown") ?? {}); // "crown" has every variable, button color included

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

export const EARLY_THEME_SCRIPT = `try{var p=JSON.parse(localStorage.getItem("${PREFS_CACHE_KEY}")||"{}");var t=p.theme;if(${JSON.stringify(THEME_IDS)}.indexOf(t)<0)t="studio";var e=document.documentElement;e.dataset.theme=t;var F=${FORGED_JSON};if(F[t]){e.dataset.look="forged";for(var k in F[t])e.style.setProperty(k,F[t][k]);}if(p.glow&&p.glow!=="normal")e.dataset.glow=p.glow;if(p.texture===false)e.dataset.texture="off";if(p.reduceMotion)e.dataset.motion="reduce";if(p.compact)e.dataset.density="compact";var m=/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(p.accent||"");if(m){var c=[m[1],m[2],m[3]].map(function(x){return parseInt(x,16)});e.style.setProperty("--accent-rgb",c.join(" "));e.style.setProperty("--accent2-rgb",c.map(function(v){return Math.round(v*0.78)}).join(" "));}}catch(x){document.documentElement.dataset.theme="studio";}`;
