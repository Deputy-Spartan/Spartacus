import sharp from "sharp";
import type { ProfileTheme } from "@spartacus/shared";

// Draws a profile card as a PNG (same approach as the /rank card: SVG drawn
// by sharp). Emoji can't be drawn as text on the server (no emoji font), so
// badges are drawn as Twemoji / Discord emoji images instead.

export interface ProfileCardData {
  name: string;
  avatarUrl: string;
  title: string;
  bio: string | null;
  theme: ProfileTheme;
  level: number;
  xp: number;
  xpForNextLevel: number;
  prestige: number;
  streak: number;
  memberSince: string | null; // e.g. "Mar 2025"
  stats: Array<[string, string]>; // [label, value], up to 6
  badges: Array<{ emoji: string; label: string }>; // up to 3
  games: string[]; // up to 3
  serverName: string;
}

const W = 900;
const FONT = "DejaVu Sans, Segoe UI, Arial, sans-serif";

function x(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// Anything an SVG text node can't draw (emoji and other symbols) is removed
// from names, titles and bios, so it doesn't show as empty boxes.
function plain(s: string): string {
  return s
    .replace(/\p{Extended_Pictographic}|‍|️|[\u{1F1E6}-\u{1F1FF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fit(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

function wrap(s: string, width: number, lines: number): string[] {
  const words = s.split(" ");
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > width) {
      out.push(cur.trim());
      cur = w;
      if (out.length === lines) break;
    } else cur = `${cur} ${w}`;
  }
  if (out.length < lines && cur.trim()) out.push(cur.trim());
  if (out.length === lines && words.join(" ").length > out.join(" ").length) out[lines - 1] = fit(out[lines - 1] + " …", width);
  return out;
}

const imageCache = new Map<string, string | null>();
async function fetchDataUri(url: string): Promise<string | null> {
  if (imageCache.has(url)) return imageCache.get(url) ?? null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(String(res.status));
    const buf = Buffer.from(await res.arrayBuffer());
    const uri = `data:${res.headers.get("content-type") ?? "image/png"};base64,${buf.toString("base64")}`;
    if (imageCache.size > 300) imageCache.clear();
    imageCache.set(url, uri);
    return uri;
  } catch {
    imageCache.set(url, null);
    return null;
  }
}

async function emojiImage(emoji: string): Promise<string | null> {
  const custom = emoji.match(/^<(a?):\w+:(\d+)>$/);
  if (custom) return fetchDataUri(`https://cdn.discordapp.com/emojis/${custom[2]}.png?size=96`);
  const points = Array.from(emoji).map((c) => (c.codePointAt(0) as number).toString(16));
  const base = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72/";
  return (await fetchDataUri(`${base}${points.filter((p) => p !== "fe0f").join("-")}.png`)) ?? (await fetchDataUri(`${base}${points.join("-")}.png`));
}

async function avatarImage(url: string): Promise<string | null> {
  return fetchDataUri(`${url}${url.includes("?") ? "&" : "?"}size=256`);
}

export async function drawProfileCard(d: ProfileCardData): Promise<Buffer> {
  const t = d.theme;
  const name = fit(plain(d.name) || "Member", 24);
  const sub = [plain(d.title), d.streak > 0 ? `${d.streak}-day streak` : null, d.memberSince ? `since ${d.memberSince}` : null].filter(Boolean).join("  ·  ");
  const bioLines = d.bio ? wrap(plain(d.bio), 64, 2) : [];
  const [avatar, ...badgeImgs] = await Promise.all([avatarImage(d.avatarUrl), ...d.badges.map((b) => emojiImage(b.emoji))]);

  let y = 0;
  const parts: string[] = [];
  // Banner
  parts.push(`<rect x="0" y="0" width="${W}" height="150" fill="url(#banner)"/>`);
  parts.push(`<rect x="0" y="130" width="${W}" height="20" fill="#15171c"/>`);
  const lvl = `LVL ${d.level}${d.prestige > 0 ? `  ·  P${d.prestige}` : ""}`;
  const pillW = 30 + lvl.length * 13;
  parts.push(`<rect x="${W - 30 - pillW}" y="24" width="${pillW}" height="40" rx="20" fill="#000" fill-opacity="0.45" stroke="#fff" stroke-opacity="0.25"/>`);
  parts.push(`<text x="${W - 30 - pillW / 2}" y="51" font-family="${FONT}" font-size="20" font-weight="bold" fill="#fff" text-anchor="middle">${x(lvl)}</text>`);
  // Avatar
  const ax = 50, ay = 70, ar = 72;
  parts.push(`<circle cx="${ax + ar}" cy="${ay + ar}" r="${ar + 7}" fill="#15171c"/>`);
  parts.push(
    avatar
      ? `<clipPath id="av"><circle cx="${ax + ar}" cy="${ay + ar}" r="${ar}"/></clipPath><image href="${avatar}" x="${ax}" y="${ay}" width="${ar * 2}" height="${ar * 2}" clip-path="url(#av)" preserveAspectRatio="xMidYMid slice"/>`
      : `<circle cx="${ax + ar}" cy="${ay + ar}" r="${ar}" fill="${t.accent}"/>`
  );
  // Name + subtitle
  parts.push(`<text x="220" y="196" font-family="${FONT}" font-size="38" font-weight="bold" fill="#ffffff">${x(name)}</text>`);
  parts.push(`<text x="220" y="230" font-family="${FONT}" font-size="20" fill="#9aa3b5">${x(fit(sub, 62))}</text>`);
  y = 262;
  // Bio
  for (const line of bioLines) {
    y += 30;
    parts.push(`<text x="50" y="${y}" font-family="${FONT}" font-size="21" fill="#c9d1dd">${x(line)}</text>`);
  }
  // XP bar
  y += 26;
  const prog = d.xpForNextLevel > 0 ? Math.max(0, Math.min(1, d.xp / d.xpForNextLevel)) : 0;
  parts.push(`<rect x="50" y="${y}" width="${W - 100}" height="16" rx="8" fill="#ffffff" fill-opacity="0.08"/>`);
  parts.push(`<rect x="50" y="${y}" width="${Math.max(16, Math.round((W - 100) * prog))}" height="16" rx="8" fill="${t.accent}"/>`);
  y += 42;
  parts.push(`<text x="50" y="${y}" font-family="${FONT}" font-size="17" fill="#8a93a8">${x(`${d.xp.toLocaleString("en-US")} / ${d.xpForNextLevel.toLocaleString("en-US")} XP to level ${d.level + 1}`)}</text>`);
  // Stats grid (3 per row)
  if (d.stats.length) {
    y += 22;
    const cw = (W - 100 - 24) / 3;
    d.stats.slice(0, 6).forEach(([label, value], i) => {
      const cx = 50 + (i % 3) * (cw + 12);
      const cy = y + Math.floor(i / 3) * 92;
      parts.push(`<rect x="${cx}" y="${cy}" width="${cw}" height="80" rx="14" fill="#ffffff" fill-opacity="0.045"/>`);
      parts.push(`<text x="${cx + 18}" y="${cy + 30}" font-family="${FONT}" font-size="15" letter-spacing="1.5" fill="#8a93a8">${x(label.toUpperCase())}</text>`);
      parts.push(`<text x="${cx + 18}" y="${cy + 64}" font-family="${FONT}" font-size="28" font-weight="bold" fill="${t.accent}">${x(fit(value, 16))}</text>`);
    });
    y += Math.ceil(Math.min(6, d.stats.length) / 3) * 92 - 12;
  }
  // Badges and games, side by side
  if (d.badges.length || d.games.length) {
    y += 34;
    if (d.badges.length) {
      parts.push(`<text x="50" y="${y}" font-family="${FONT}" font-size="15" letter-spacing="1.5" fill="#8a93a8">BADGES</text>`);
      d.badges.forEach((b, i) => {
        const bx = 50 + i * 74;
        parts.push(`<rect x="${bx}" y="${y + 14}" width="62" height="62" rx="14" fill="#ffffff" fill-opacity="0.06" stroke="#ffffff" stroke-opacity="0.08"/>`);
        const img = badgeImgs[i];
        if (img) parts.push(`<image href="${img}" x="${bx + 13}" y="${y + 27}" width="36" height="36"/>`);
        else parts.push(`<text x="${bx + 31}" y="${y + 54}" font-family="${FONT}" font-size="16" fill="#c9d1dd" text-anchor="middle">${x(fit(plain(b.label), 4))}</text>`);
      });
    }
    if (d.games.length) {
      const gx = d.badges.length ? 290 : 50;
      parts.push(`<text x="${gx}" y="${y}" font-family="${FONT}" font-size="15" letter-spacing="1.5" fill="#8a93a8">PLAYS</text>`);
      let cx = gx;
      let cy = y + 14;
      for (const g of d.games) {
        const label = fit(plain(g), 22);
        const w = 34 + label.length * 11.5;
        if (cx + w > W - 50) {
          cx = gx;
          cy += 44;
        }
        parts.push(`<rect x="${cx}" y="${cy}" width="${w}" height="36" rx="18" fill="#ffffff" fill-opacity="0.06"/>`);
        parts.push(`<text x="${cx + w / 2}" y="${cy + 24}" font-family="${FONT}" font-size="17" fill="#e5e9f0" text-anchor="middle">${x(label)}</text>`);
        cx += w + 10;
      }
      y = Math.max(y, cy - 14);
    }
    y += 76;
  }
  // Footer
  y += 26;
  parts.push(`<line x1="50" y1="${y}" x2="${W - 50}" y2="${y}" stroke="#ffffff" stroke-opacity="0.07"/>`);
  y += 30;
  parts.push(`<text x="50" y="${y}" font-family="${FONT}" font-size="16" fill="#6b7280">${x(fit(plain(d.serverName) || "Discord", 40))}</text>`);
  parts.push(`<text x="${W - 50}" y="${y}" font-family="${FONT}" font-size="16" fill="#6b7280" text-anchor="end">spartc.us</text>`);
  const H = y + 26;

  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="banner" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.from}"/><stop offset="1" stop-color="${t.to}"/></linearGradient>
    <clipPath id="card"><rect x="0" y="0" width="${W}" height="${H}" rx="26"/></clipPath>
  </defs>
  <g clip-path="url(#card)">
    <rect x="0" y="0" width="${W}" height="${H}" fill="#15171c"/>
    ${parts.join("\n    ")}
  </g>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// Two cards side by side, tops aligned (for Compare).
export async function drawSideBySide(a: Buffer, b: Buffer): Promise<Buffer> {
  const [ma, mb] = await Promise.all([sharp(a).metadata(), sharp(b).metadata()]);
  const gap = 24;
  const width = (ma.width ?? W) + (mb.width ?? W) + gap;
  const height = Math.max(ma.height ?? 0, mb.height ?? 0);
  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: a, left: 0, top: 0 },
      { input: b, left: (ma.width ?? W) + gap, top: 0 },
    ])
    .png()
    .toBuffer();
}
