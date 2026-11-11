import fetch from "node-fetch";
import type { LivePlatform } from "@spartacus/shared";

// Checks whether one streamer is live right now on their platform.
// Each check gives up after 12 seconds and reports an error instead of
// "offline", so a slow site never ends someone's stream by mistake.

export interface LiveCheck {
  live: boolean;
  title?: string | null;
  game?: string | null;
  viewers?: number | null;
  thumbnail?: string | null;
  avatar?: string | null;
  url?: string | null;
  name?: string | null;
  startedAt?: Date | null;
  error?: string;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

async function get(url: string, headers: Record<string, string> = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    return await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", ...headers }, signal: ctrl.signal as never });
  } finally {
    clearTimeout(t);
  }
}

const unescapeJson = (s: string) => {
  try {
    return JSON.parse(`"${s}"`) as string;
  } catch {
    return s;
  }
};

// ---- Twitch (official API; needs TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET) ----
let twitchToken: { token: string; expiresAt: number } | null = null;
async function twitchAuth(): Promise<string | null> {
  if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) return null;
  if (twitchToken && twitchToken.expiresAt > Date.now()) return twitchToken.token;
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.TWITCH_CLIENT_ID, client_secret: process.env.TWITCH_CLIENT_SECRET, grant_type: "client_credentials" }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token: string; expires_in: number };
  twitchToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 - 60_000 };
  return twitchToken.token;
}

// One batched call for every Twitch streamer.
export async function checkTwitchMany(logins: string[]): Promise<Map<string, LiveCheck>> {
  const out = new Map<string, LiveCheck>();
  if (!logins.length) return out;
  const token = await twitchAuth().catch(() => null);
  if (!token) {
    for (const l of logins) out.set(l, { live: false, error: "Twitch isn't set up on the bot yet (TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET)." });
    return out;
  }
  const headers = { "Client-Id": process.env.TWITCH_CLIENT_ID as string, Authorization: `Bearer ${token}` };
  for (let i = 0; i < logins.length; i += 100) {
    const chunk = logins.slice(i, i + 100);
    const q = chunk.map((l) => `user_login=${encodeURIComponent(l)}`).join("&");
    const [streams, users] = await Promise.all([
      get(`https://api.twitch.tv/helix/streams?${q}`, headers).then((r) => r.json() as Promise<{ data?: Array<Record<string, string | number>> }>),
      get(`https://api.twitch.tv/helix/users?${chunk.map((l) => `login=${encodeURIComponent(l)}`).join("&")}`, headers).then((r) => r.json() as Promise<{ data?: Array<Record<string, string>> }>),
    ]).catch(() => [null, null] as const);
    if (!streams) {
      for (const l of chunk) out.set(l, { live: false, error: "Twitch didn't answer." });
      continue;
    }
    const avatars = new Map((users?.data ?? []).map((u) => [u.login.toLowerCase(), { avatar: u.profile_image_url, name: u.display_name }]));
    const live = new Map((streams.data ?? []).map((s) => [String(s.user_login).toLowerCase(), s]));
    for (const l of chunk) {
      const s = live.get(l.toLowerCase());
      const u = avatars.get(l.toLowerCase());
      out.set(
        l,
        s
          ? {
              live: true,
              title: String(s.title ?? ""),
              game: String(s.game_name ?? "") || null,
              viewers: Number(s.viewer_count ?? 0),
              thumbnail: String(s.thumbnail_url ?? "").replace("{width}", "1280").replace("{height}", "720") + `?t=${Date.now()}`,
              avatar: u?.avatar ?? null,
              name: u?.name ?? String(s.user_name ?? l),
              url: `https://twitch.tv/${l}`,
              startedAt: s.started_at ? new Date(String(s.started_at)) : null,
            }
          : { live: false, avatar: u?.avatar ?? null, name: u?.name ?? null },
      );
    }
  }
  return out;
}

// ---- YouTube (the channel's /live page; no key needed) ----
export async function checkYouTube(handle: string): Promise<LiveCheck> {
  const path = handle.startsWith("UC") ? `channel/${handle}` : handle.startsWith("@") ? handle : `@${handle}`;
  const res = await get(`https://www.youtube.com/${path}/live`).catch(() => null);
  if (!res) return { live: false, error: "YouTube didn't answer." };
  if (res.status === 404) return { live: false, error: "That YouTube channel wasn't found." };
  const html = await res.text();
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? "";
  const live = canonical.includes("/watch?v=") && html.includes('"isLiveNow":true');
  const name = html.match(/<link itemprop="name" content="([^"]+)"/)?.[1] ?? null;
  if (!live) return { live: false, name };
  const title = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ?? null;
  const image = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] ?? null;
  const viewers = Number(html.match(/"originalViewCount":"(\d+)"/)?.[1] ?? NaN);
  const avatar = html.match(/"channelThumbnail":\{"thumbnails":\[\{"url":"([^"]+)"/)?.[1] ?? null;
  const started = html.match(/"startTimestamp":"([^"]+)"/)?.[1];
  return {
    live: true,
    title: title ? unescapeHtml(title) : null,
    thumbnail: image,
    viewers: Number.isFinite(viewers) ? viewers : null,
    url: canonical,
    name: name ? unescapeHtml(name) : null,
    avatar,
    startedAt: started ? new Date(started) : null,
  };
}

const unescapeHtml = (s: string) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

// ---- Kick (official public API; needs KICK_CLIENT_ID and KICK_CLIENT_SECRET
// from a free app at kick.com/settings/developer) ----
let kickToken: { token: string; expiresAt: number } | null = null;
async function kickAuth(): Promise<string | null> {
  if (!process.env.KICK_CLIENT_ID || !process.env.KICK_CLIENT_SECRET) return null;
  if (kickToken && kickToken.expiresAt > Date.now()) return kickToken.token;
  const res = await fetch("https://id.kick.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.KICK_CLIENT_ID, client_secret: process.env.KICK_CLIENT_SECRET, grant_type: "client_credentials" }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token: string; expires_in: number };
  kickToken = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 - 60_000 };
  return kickToken.token;
}

export async function checkKick(slug: string): Promise<LiveCheck> {
  const token = await kickAuth().catch(() => null);
  if (!token) return { live: false, error: "Kick isn't set up on the bot yet (KICK_CLIENT_ID and KICK_CLIENT_SECRET)." };
  const s = slug.toLowerCase();
  const res = await get(`https://api.kick.com/public/v1/channels?slug=${encodeURIComponent(s)}`, { Authorization: `Bearer ${token}`, Accept: "application/json" }).catch(() => null);
  if (!res) return { live: false, error: "Kick didn't answer." };
  if (!res.ok) return { live: false, error: `Kick said ${res.status}.` };
  const j = (await res.json().catch(() => null)) as {
    data?: Array<{
      slug?: string;
      stream_title?: string;
      category?: { name?: string };
      stream?: { is_live?: boolean; viewer_count?: number; thumbnail?: string; start_time?: string };
    }>;
  } | null;
  const c = j?.data?.[0];
  if (!c) return { live: false, error: "That Kick channel wasn't found." };
  const base = { name: c.slug ?? s, url: `https://kick.com/${c.slug ?? s}` };
  if (!c.stream?.is_live) return { live: false, ...base };
  return {
    live: true,
    ...base,
    title: c.stream_title ?? null,
    game: c.category?.name ?? null,
    viewers: c.stream.viewer_count ?? null,
    thumbnail: c.stream.thumbnail ? `${c.stream.thumbnail}${c.stream.thumbnail.includes("?") ? "&" : "?"}t=${Date.now()}` : null,
    startedAt: c.stream.start_time ? new Date(c.stream.start_time) : null,
  };
}

// ---- TikTok (its live page; beta, TikTok changes this often) ----
export async function checkTikTok(user: string): Promise<LiveCheck> {
  const u = user.replace(/^@/, "");
  const res = await get(`https://www.tiktok.com/@${encodeURIComponent(u)}/live`).catch(() => null);
  if (!res) return { live: false, error: "TikTok didn't answer." };
  if (!res.ok) return { live: false, error: `TikTok said ${res.status}.` };
  const html = await res.text();
  // 2 = live, 4 = ended. Only trust it when the room status is there.
  const status = html.match(/"status":(\d+)/)?.[1];
  if (!status) return { live: false, error: "TikTok didn't show a live status (it may be blocking the bot)." };
  const base = { name: u, url: `https://www.tiktok.com/@${u}/live` };
  if (status !== "2") return { live: false, ...base };
  const title = html.match(/"title":"((?:[^"\\]|\\.)*)"/)?.[1];
  const viewers = Number(html.match(/"userCount":(\d+)/)?.[1] ?? NaN);
  const cover = html.match(/"coverUrl":"((?:[^"\\]|\\.)*)"/)?.[1];
  const avatar = html.match(/"avatarLarger":"((?:[^"\\]|\\.)*)"/)?.[1];
  return {
    live: true,
    ...base,
    title: title ? unescapeJson(title) : null,
    viewers: Number.isFinite(viewers) ? viewers : null,
    thumbnail: cover ? unescapeJson(cover) : null,
    avatar: avatar ? unescapeJson(avatar) : null,
  };
}

export async function checkOne(platform: LivePlatform, handle: string): Promise<LiveCheck> {
  try {
    if (platform === "twitch") return (await checkTwitchMany([handle])).get(handle) ?? { live: false, error: "No answer." };
    if (platform === "youtube") return await checkYouTube(handle);
    if (platform === "kick") return await checkKick(handle);
    if (platform === "tiktok") return await checkTikTok(handle);
    return { live: false, error: "Other platforms are announced with /golive." };
  } catch (err) {
    return { live: false, error: err instanceof Error ? err.message : "Check failed." };
  }
}
