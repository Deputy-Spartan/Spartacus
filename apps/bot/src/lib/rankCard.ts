import sharp from "sharp";

export interface RankCardParams {
  username: string;
  avatarUrl: string;
  level: number;
  xp: number;
  xpForNextLevel: number;
  rank: number;
  prestige: number;
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function fetchAvatarBase64(avatarUrl: string): Promise<string | null> {
  try {
    const res = await fetch(`${avatarUrl}${avatarUrl.includes("?") ? "&" : "?"}size=256`);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? "image/png";
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function generateRankCard(params: RankCardParams): Promise<Buffer> {
  const { username, avatarUrl, level, xp, xpForNextLevel, rank, prestige } = params;

  const width = 900;
  const height = 300;
  const avatarSize = 180;
  const avatarX = 60;
  const avatarY = (height - avatarSize) / 2;
  const barX = avatarX + avatarSize + 50;
  const barWidth = width - barX - 60;
  const barY = 190;
  const barHeight = 28;

  const progress = xpForNextLevel > 0 ? Math.max(0, Math.min(1, xp / xpForNextLevel)) : 0;
  const fillWidth = Math.round(barWidth * progress);

  const avatarDataUri = await fetchAvatarBase64(avatarUrl);

  const clipId = "avatarClip";
  const avatarMarkup = avatarDataUri
    ? `<clipPath id="${clipId}">
         <circle cx="${avatarX + avatarSize / 2}" cy="${height / 2}" r="${avatarSize / 2}" />
       </clipPath>
       <image href="${avatarDataUri}" x="${avatarX}" y="${avatarY}" width="${avatarSize}" height="${avatarSize}" clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid slice" />
       <circle cx="${avatarX + avatarSize / 2}" cy="${height / 2}" r="${avatarSize / 2}" fill="none" stroke="#5865F2" stroke-width="4" />`
    : `<circle cx="${avatarX + avatarSize / 2}" cy="${height / 2}" r="${avatarSize / 2}" fill="#5865F2" stroke="#4752C4" stroke-width="4" />`;

  const prestigeBadge =
    prestige > 0
      ? `<g transform="translate(${barX}, 30)">
           <rect x="0" y="0" width="200" height="34" rx="17" fill="#F5A623" />
           <text x="100" y="23" font-family="sans-serif" font-size="18" font-weight="bold" fill="#1a1a1a" text-anchor="middle">⭐ Prestige ${prestige}</text>
         </g>`
      : "";

  const svg = `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1e1f29" />
      <stop offset="100%" stop-color="#111219" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" rx="20" fill="url(#bg)" />
  ${avatarMarkup}
  <text x="${barX}" y="${prestige > 0 ? 100 : 80}" font-family="sans-serif" font-size="36" font-weight="bold" fill="#ffffff">${escapeXml(username)}</text>
  <text x="${barX}" y="${(prestige > 0 ? 100 : 80) + 40}" font-family="sans-serif" font-size="22" fill="#9aa0b4">Rank #${rank} &#8226; Level ${level}</text>
  ${prestigeBadge}
  <rect x="${barX}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="${barHeight / 2}" fill="#2b2d3a" />
  <rect x="${barX}" y="${barY}" width="${Math.max(fillWidth, fillWidth > 0 ? barHeight : 0)}" height="${barHeight}" rx="${barHeight / 2}" fill="#5865F2" />
  <text x="${barX}" y="${barY + barHeight + 32}" font-family="sans-serif" font-size="18" fill="#c7cad6">${xp.toLocaleString()} / ${xpForNextLevel.toLocaleString()} XP</text>
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
