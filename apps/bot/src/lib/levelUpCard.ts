import sharp from "sharp";
import { circle, fetchImage } from "./profileCardRender";

// The level-up card: the level's own color, the big new level number, the
// member's avatar, and what they got. Drawn like the profile card (SVG by
// sharp, avatar pasted on after, 1.5x for phones).
const W = 900;
const H = 320;
const S = 1.5;
const FONT = "DejaVu Sans, Segoe UI, Arial, sans-serif";

function x(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function plain(s: string) {
  return s.replace(/\p{Extended_Pictographic}|‍|️/gu, "").replace(/\s+/g, " ").trim();
}
function fit(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export async function drawLevelUpCard(opts: { name: string; avatarUrl: string; level: number; color: string; rankName: string | null; nextLine: string | null }): Promise<Buffer> {
  const c = opts.color;
  const avatarUrl = opts.avatarUrl.replace(/\.(webp|gif|jpg|jpeg)(?=\?|$)/i, ".png").replace(/[?&]size=\d+/g, "");
  const avatar = opts.avatarUrl ? await fetchImage(`${avatarUrl}${avatarUrl.includes("?") ? "&" : "?"}size=256`) : null;
  const lv = String(opts.level);
  const svg = `<svg width="${W * S}" height="${H * S}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}" stop-opacity="0.55"/><stop offset="0.55" stop-color="#15171c"/><stop offset="1" stop-color="#15171c"/></linearGradient>
    <radialGradient id="glow" cx="0.2" cy="0.5" r="0.5"><stop offset="0" stop-color="${c}" stop-opacity="0.55"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>
    <clipPath id="card"><rect x="0" y="0" width="${W}" height="${H}" rx="28"/></clipPath>
  </defs>
  <g clip-path="url(#card)">
    <rect width="${W}" height="${H}" fill="#15171c"/>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <circle cx="160" cy="${H / 2}" r="190" fill="url(#glow)"/>
    <circle cx="160" cy="${H / 2}" r="104" fill="${c}"/>
    <circle cx="160" cy="${H / 2}" r="96" fill="#15171c"/>
    <text x="320" y="92" font-family="${FONT}" font-size="26" font-weight="bold" letter-spacing="6" fill="${c}">LEVEL UP</text>
    <text x="316" y="196" font-family="${FONT}" font-size="${lv.length > 2 ? 104 : 120}" font-weight="bold" fill="#ffffff">${x(lv)}</text>
    <text x="${330 + lv.length * 70}" y="196" font-family="${FONT}" font-size="34" font-weight="bold" fill="#ffffff" fill-opacity="0.9">${x(fit(plain(opts.name) || "Member", 18))}</text>
    ${opts.rankName ? `<text x="${330 + lv.length * 70}" y="150" font-family="${FONT}" font-size="22" fill="${c}">${x(fit(plain(opts.rankName), 26))}</text>` : ""}
    ${opts.nextLine ? `<text x="320" y="262" font-family="${FONT}" font-size="22" fill="#9aa3b5">${x(fit(plain(opts.nextLine), 52))}</text>` : ""}
    <rect x="0" y="${H - 8}" width="${W}" height="8" fill="${c}"/>
  </g>
</svg>`;
  const base = await sharp(Buffer.from(svg)).png().toBuffer();
  if (!avatar) return base;
  try {
    const px = Math.round(192 * S);
    const round = await circle(avatar, px);
    return sharp(base).composite([{ input: round, left: Math.round((160 - 96) * S), top: Math.round((H / 2 - 96) * S) }]).png().toBuffer();
  } catch {
    return base;
  }
}
