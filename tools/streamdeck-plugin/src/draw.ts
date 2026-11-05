import { GLYPHS } from "./glyphs.gen";

export interface Face {
  title: string;
  line: string;
  tone: "" | "red" | "green" | "warn" | "off";
  pct?: number;
}

// Every key is drawn here as one image: a line icon in the state's color, the
// action's name, and a status pill. Stream Deck's own title stays empty, so
// nothing overlaps and the type is the same on every key.
const ACCENT: Record<string, string> = { "": "#8fb3dc", red: "#f87171", green: "#4ade80", warn: "#fbbf24", off: "#9ca3af" };
const FONT = "Segoe UI, SF Pro Display, Helvetica Neue, Helvetica, Arial, sans-serif";
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Emoji don't draw reliably inside key images, so they're left off the text.
export const plain = (t: string) => t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "").replace(/\s+/g, " ").trim();
export const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
const dataUrl = (svg: string) => `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
const glyph = (name: string | undefined, color: string, x: number, y: number, size: number) =>
  `<g transform="translate(${x} ${y}) scale(${size / 24})" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[name ?? ""] ?? ""}</g>`;

export function keyImage(face: Face, glyphName: string | undefined, pressAgain: boolean) {
  const tone = pressAgain ? "warn" : face.tone;
  const accent = ACCENT[tone] ?? ACCENT[""];
  const title = clip(plain(face.title), 16);
  const titleSize = title.length > 13 ? 14 : title.length > 10 ? 16 : 18;
  const status = clip(plain(pressAgain ? "Press again" : face.line).toUpperCase(), 14);
  const pillW = Math.min(128, Math.max(48, Math.round(status.length * 8.4 + 22)));
  const pill = status
    ? `<rect x="${72 - pillW / 2}" y="104" width="${pillW}" height="26" rx="13" fill="${accent}" fill-opacity="0.16" stroke="${accent}" stroke-opacity="0.55"/><text x="72" y="121.5" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="700" letter-spacing="0.6" fill="${accent}">${esc(status)}</text>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f232c"/><stop offset="1" stop-color="#121419"/></linearGradient>
<radialGradient id="glow" cx="0.5" cy="0.28" r="0.55"><stop offset="0" stop-color="${accent}" stop-opacity="0.22"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs>
<rect width="144" height="144" rx="22" fill="url(#bg)"/><rect width="144" height="144" rx="22" fill="url(#glow)"/>
<rect x="1" y="1" width="142" height="142" rx="21" fill="none" stroke="${pressAgain ? accent : "#ffffff"}" stroke-opacity="${pressAgain ? 0.9 : 0.07}" stroke-width="2"/>
${glyph(glyphName, accent, 50, 16, 44)}
<text x="72" y="${status ? 89 : 104}" text-anchor="middle" font-family="${FONT}" font-size="${titleSize}" font-weight="600" fill="#f3f4f6">${esc(title)}</text>
${pill}</svg>`;
  return dataUrl(svg);
}
export const iconImage = (glyphName: string | undefined, tone: string) =>
  dataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">${glyph(glyphName, ACCENT[tone] ?? ACCENT[""], 6, 6, 36)}</svg>`);
