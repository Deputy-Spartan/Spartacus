import sharp from "sharp";
import type { ProfileTheme } from "@spartacus/shared";

// Draws a profile card as a PNG. The layout is an SVG drawn by sharp; the
// avatar and badge pictures are pasted on afterwards by sharp itself, which
// reads WebP/PNG/GIF reliably (the SVG renderer on the server can't open
// Discord's WebP avatars, which left an empty circle). Emoji can't be drawn as
// text on the server either, so badges are Twemoji / Discord emoji images.
//
// Sizes are generous because Discord shrinks the image to fit a phone screen,
// and the whole card is drawn at 1.5x so it stays sharp when zoomed.

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

const W = 900; // layout units
const S = 1.5; // pixels per unit
const FONT = "DejaVu Sans, Segoe UI, Arial, sans-serif";
const BG = "#15171c";

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

const imageCache = new Map<string, Buffer | null>();
export async function fetchImage(url: string): Promise<Buffer | null> {
  if (imageCache.has(url)) return imageCache.get(url) ?? null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(String(res.status));
    const buf = Buffer.from(await res.arrayBuffer());
    await sharp(buf).metadata(); // make sure it's an image sharp can read
    if (imageCache.size > 300) imageCache.clear();
    imageCache.set(url, buf);
    return buf;
  } catch {
    imageCache.set(url, null);
    return null;
  }
}

async function emojiImage(emoji: string): Promise<Buffer | null> {
  const custom = emoji.match(/^<(a?):\w+:(\d+)>$/);
  if (custom) return fetchImage(`https://cdn.discordapp.com/emojis/${custom[2]}.png?size=128`);
  const points = Array.from(emoji).map((c) => (c.codePointAt(0) as number).toString(16));
  const base = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72/";
  return (await fetchImage(`${base}${points.filter((p) => p !== "fe0f").join("-")}.png`)) ?? (await fetchImage(`${base}${points.join("-")}.png`));
}

async function avatarImage(url: string): Promise<Buffer | null> {
  if (!url) return null;
  // Ask Discord for a PNG at a good size whatever the URL already says.
  const clean = url.replace(/\.(webp|gif|jpg|jpeg)(?=\?|$)/i, ".png").replace(/[?&]size=\d+/g, "");
  return fetchImage(`${clean}${clean.includes("?") ? "&" : "?"}size=512`);
}

// A square picture cut into a circle, size px wide.
export async function circle(buf: Buffer, size: number): Promise<Buffer> {
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`);
  return sharp(buf).resize(size, size, { fit: "cover" }).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

export async function drawProfileCard(d: ProfileCardData): Promise<Buffer> {
  const t = d.theme;
  const name = fit(plain(d.name) || "Member", 20);
  const sub = [plain(d.title), d.streak > 0 ? `${d.streak}-day streak` : null, d.memberSince ? `since ${d.memberSince}` : null].filter(Boolean).join("  ·  ");
  const bioLines = d.bio ? wrap(plain(d.bio), 52, 2) : [];
  const [avatar, ...badgeImgs] = await Promise.all([avatarImage(d.avatarUrl), ...d.badges.map((b) => emojiImage(b.emoji))]);
  const pastes: Array<{ buf: Buffer; size: number; left: number; top: number; round: boolean }> = [];

  const parts: string[] = [];
  // Banner
  parts.push(`<rect x="0" y="0" width="${W}" height="170" fill="url(#banner)"/>`);
  parts.push(`<rect x="0" y="150" width="${W}" height="20" fill="${BG}"/>`);
  const lvl = `LVL ${d.level}${d.prestige > 0 ? `  ·  P${d.prestige}` : ""}`;
  const pillW = 40 + lvl.length * 16;
  parts.push(`<rect x="${W - 30 - pillW}" y="26" width="${pillW}" height="50" rx="25" fill="#000" fill-opacity="0.45" stroke="#fff" stroke-opacity="0.25"/>`);
  parts.push(`<text x="${W - 30 - pillW / 2}" y="60" font-family="${FONT}" font-size="25" font-weight="bold" fill="#fff" text-anchor="middle">${x(lvl)}</text>`);
  // Avatar: a ring now, the picture pasted on after
  const ar = 86, ax = 40, ay = 74;
  parts.push(`<circle cx="${ax + ar}" cy="${ay + ar}" r="${ar + 8}" fill="${BG}"/>`);
  parts.push(`<circle cx="${ax + ar}" cy="${ay + ar}" r="${ar}" fill="${t.accent}"/>`);
  if (avatar) pastes.push({ buf: avatar, size: ar * 2, left: ax, top: ay, round: true });
  else parts.push(`<text x="${ax + ar}" y="${ay + ar + 26}" font-family="${FONT}" font-size="72" font-weight="bold" fill="#fff" text-anchor="middle">${x((name[0] || "?").toUpperCase())}</text>`);
  // Name + subtitle
  parts.push(`<text x="232" y="214" font-family="${FONT}" font-size="46" font-weight="bold" fill="#ffffff">${x(name)}</text>`);
  parts.push(`<text x="232" y="254" font-family="${FONT}" font-size="24" fill="#9aa3b5">${x(fit(sub, 46))}</text>`);
  let y = 286;
  // Bio
  for (const line of bioLines) {
    y += 38;
    parts.push(`<text x="44" y="${y}" font-family="${FONT}" font-size="28" fill="#d5dbe5">${x(line)}</text>`);
  }
  // XP bar
  y += 30;
  const prog = d.xpForNextLevel > 0 ? Math.max(0, Math.min(1, d.xp / d.xpForNextLevel)) : 0;
  parts.push(`<rect x="44" y="${y}" width="${W - 88}" height="22" rx="11" fill="#ffffff" fill-opacity="0.08"/>`);
  parts.push(`<rect x="44" y="${y}" width="${Math.max(22, Math.round((W - 88) * prog))}" height="22" rx="11" fill="${t.accent}"/>`);
  y += 54;
  parts.push(`<text x="44" y="${y}" font-family="${FONT}" font-size="22" fill="#8a93a8">${x(`${d.xp.toLocaleString("en-US")} / ${d.xpForNextLevel.toLocaleString("en-US")} XP to level ${d.level + 1}`)}</text>`);
  // Stats grid (3 per row)
  if (d.stats.length) {
    y += 24;
    const cw = (W - 88 - 28) / 3;
    d.stats.slice(0, 6).forEach(([label, value], i) => {
      const cx = 44 + (i % 3) * (cw + 14);
      const cy = y + Math.floor(i / 3) * 120;
      parts.push(`<rect x="${cx}" y="${cy}" width="${cw}" height="106" rx="16" fill="#ffffff" fill-opacity="0.05"/>`);
      parts.push(`<text x="${cx + 20}" y="${cy + 38}" font-family="${FONT}" font-size="19" letter-spacing="1.5" fill="#8a93a8">${x(label.toUpperCase())}</text>`);
      parts.push(`<text x="${cx + 20}" y="${cy + 84}" font-family="${FONT}" font-size="38" font-weight="bold" fill="${t.accent}">${x(fit(value, 12))}</text>`);
    });
    y += Math.ceil(Math.min(6, d.stats.length) / 3) * 120 - 14;
  }
  // Badges, then games on their own line
  if (d.badges.length) {
    y += 44;
    parts.push(`<text x="44" y="${y}" font-family="${FONT}" font-size="19" letter-spacing="1.5" fill="#8a93a8">BADGES</text>`);
    d.badges.forEach((b, i) => {
      const bx = 44 + i * 96;
      const by = y + 16;
      parts.push(`<rect x="${bx}" y="${by}" width="82" height="82" rx="18" fill="#ffffff" fill-opacity="0.06" stroke="#ffffff" stroke-opacity="0.08"/>`);
      const img = badgeImgs[i];
      if (img) pastes.push({ buf: img, size: 52, left: bx + 15, top: by + 15, round: false });
      else parts.push(`<text x="${bx + 41}" y="${by + 50}" font-family="${FONT}" font-size="18" fill="#c9d1dd" text-anchor="middle">${x(fit(plain(b.label), 5))}</text>`);
    });
    y += 98;
  }
  if (d.games.length) {
    y += 44;
    parts.push(`<text x="44" y="${y}" font-family="${FONT}" font-size="19" letter-spacing="1.5" fill="#8a93a8">PLAYS</text>`);
    let cx = 44;
    let cy = y + 16;
    for (const g of d.games) {
      const label = fit(plain(g), 20);
      const w = 44 + label.length * 14;
      if (cx + w > W - 44) {
        cx = 44;
        cy += 60;
      }
      parts.push(`<rect x="${cx}" y="${cy}" width="${w}" height="50" rx="25" fill="#ffffff" fill-opacity="0.07"/>`);
      parts.push(`<text x="${cx + w / 2}" y="${cy + 33}" font-family="${FONT}" font-size="23" fill="#e5e9f0" text-anchor="middle">${x(label)}</text>`);
      cx += w + 12;
    }
    y = cy + 50;
  }
  // Footer
  y += 34;
  parts.push(`<line x1="44" y1="${y}" x2="${W - 44}" y2="${y}" stroke="#ffffff" stroke-opacity="0.08"/>`);
  y += 38;
  parts.push(`<text x="44" y="${y}" font-family="${FONT}" font-size="21" fill="#6b7280">${x(fit(plain(d.serverName) || "Discord", 36))}</text>`);
  parts.push(`<text x="${W - 44}" y="${y}" font-family="${FONT}" font-size="21" fill="#6b7280" text-anchor="end">spartc.us</text>`);
  const H = y + 30;

  const svg = `<svg width="${W * S}" height="${H * S}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="banner" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.from}"/><stop offset="1" stop-color="${t.to}"/></linearGradient>
    <clipPath id="card"><rect x="0" y="0" width="${W}" height="${H}" rx="28"/></clipPath>
  </defs>
  <g clip-path="url(#card)">
    <rect x="0" y="0" width="${W}" height="${H}" fill="${BG}"/>
    ${parts.join("\n    ")}
  </g>
</svg>`;
  const base = await sharp(Buffer.from(svg)).png().toBuffer();
  if (!pastes.length) return base;

  const layers = await Promise.all(
    pastes.map(async (p) => {
      const px = Math.round(p.size * S);
      try {
        const input = p.round ? await circle(p.buf, px) : await sharp(p.buf).resize(px, px, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
        return { input, left: Math.round(p.left * S), top: Math.round(p.top * S) };
      } catch {
        return null; // a picture that can't be read just isn't pasted
      }
    })
  );
  return sharp(base)
    .composite(layers.filter((l): l is NonNullable<typeof l> => !!l))
    .png()
    .toBuffer();
}

// Two cards side by side, tops aligned (for Compare).
export async function drawSideBySide(a: Buffer, b: Buffer): Promise<Buffer> {
  const [ma, mb] = await Promise.all([sharp(a).metadata(), sharp(b).metadata()]);
  const gap = Math.round(24 * S);
  const width = (ma.width ?? W * S) + (mb.width ?? W * S) + gap;
  const height = Math.max(ma.height ?? 0, mb.height ?? 0);
  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: a, left: 0, top: 0 },
      { input: b, left: (ma.width ?? W * S) + gap, top: 0 },
    ])
    .png()
    .toBuffer();
}
