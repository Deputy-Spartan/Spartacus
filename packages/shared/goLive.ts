// Going Live: the announcement posted when a streamer goes live, shared so
// the bot posts exactly what the dashboard previews.

export type LivePlatform = "twitch" | "youtube" | "kick" | "tiktok" | "other";

export interface PlatformInfo {
  id: LivePlatform;
  name: string;
  emoji: string;
  color: string;
  auto: boolean; // Spartacus checks it by itself
  needsKey?: "TWITCH" | "KICK"; // needs the platform's app keys set on the bot
  beta?: boolean;
  handleHint: string;
  url: (handle: string) => string;
}

export const LIVE_PLATFORMS: PlatformInfo[] = [
  { id: "twitch", name: "Twitch", emoji: "🟣", color: "#9146FF", auto: true, needsKey: "TWITCH", handleHint: "Twitch username, e.g. shroud", url: (h) => `https://twitch.tv/${h}` },
  { id: "youtube", name: "YouTube", emoji: "🔴", color: "#FF0000", auto: true, handleHint: "@handle or channel ID, e.g. @mkbhd", url: (h) => `https://www.youtube.com/${h.startsWith("UC") ? `channel/${h}` : h.startsWith("@") ? h : `@${h}`}` },
  { id: "kick", name: "Kick", emoji: "🟢", color: "#53FC18", auto: true, needsKey: "KICK", handleHint: "Kick username, e.g. xqc", url: (h) => `https://kick.com/${h}` },
  { id: "tiktok", name: "TikTok", emoji: "🎵", color: "#FE2C55", auto: true, beta: true, handleHint: "TikTok username, e.g. @charlidamelio", url: (h) => `https://www.tiktok.com/@${h.replace(/^@/, "")}/live` },
  { id: "other", name: "Other", emoji: "📺", color: "#5865F2", auto: false, handleHint: "Your stream link (Facebook, Trovo, Rumble, X and more)", url: (h) => h },
];

export const platformInfo = (id: string): PlatformInfo => LIVE_PLATFORMS.find((p) => p.id === id) ?? LIVE_PLATFORMS[4];

// Clean up what people paste: a full link becomes the handle.
export function cleanHandle(platform: LivePlatform, input: string): string {
  let h = input.trim();
  if (platform === "other") return h;
  h = h.replace(/^https?:\/\/(www\.|m\.)?/i, "");
  if (platform === "twitch") h = h.replace(/^twitch\.tv\//i, "");
  if (platform === "kick") h = h.replace(/^kick\.com\//i, "");
  if (platform === "tiktok") h = h.replace(/^tiktok\.com\//i, "").replace(/\/live.*$/i, "").replace(/^@/, "");
  if (platform === "youtube") {
    h = h.replace(/^youtube\.com\//i, "").replace(/\/(live|streams|featured|videos).*$/i, "");
    if (h.startsWith("channel/")) h = h.slice(8);
    if (!h.startsWith("UC") && !h.startsWith("@")) h = `@${h}`;
  }
  return h.split(/[/?#]/)[0];
}

export interface GoLiveSettingsLike {
  contentTemplate?: string | null;
  embedTitle?: string | null;
  embedDescription?: string | null;
  embedColor?: string | null; // empty = the platform's own color
  buttonLabel?: string | null;
  buttonEmoji?: string | null;
  showThumbnail?: boolean;
  showGame?: boolean;
  showViewers?: boolean;
  endedTitle?: string | null;
  endedDescription?: string | null;
  endedColor?: string | null;
  embedExtra?: unknown;
}

// One streamer's own alert look. Anything left empty uses the server's.
export interface StreamerOverrides {
  contentTemplate?: string;
  embedTitle?: string;
  embedDescription?: string;
  embedColor?: string;
  buttonLabel?: string;
  buttonEmoji?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  footerText?: string;
}
export const STREAMER_OVERRIDE_KEYS = ["contentTemplate", "embedTitle", "embedDescription", "embedColor", "buttonLabel", "buttonEmoji", "thumbnailUrl", "imageUrl", "footerText"] as const;

// The server's settings with one streamer's overrides laid on top.
export function withStreamerOverrides<T extends GoLiveSettingsLike>(s: T, raw: unknown): T {
  if (!raw || typeof raw !== "object") return s;
  const o = raw as Record<string, unknown>;
  const has = (k: string) => typeof o[k] === "string" && (o[k] as string).trim() !== "";
  const out: T = { ...s };
  for (const k of ["contentTemplate", "embedTitle", "embedDescription", "embedColor", "buttonLabel", "buttonEmoji"] as const) if (has(k)) (out as Record<string, unknown>)[k] = o[k];
  const extra = ["thumbnailUrl", "imageUrl", "footerText"].filter(has);
  if (extra.length) {
    const base = s.embedExtra && typeof s.embedExtra === "object" ? (s.embedExtra as Record<string, unknown>) : {};
    out.embedExtra = { ...base, ...Object.fromEntries(extra.map((k) => [k, o[k]])) };
  }
  return out;
}

export const GO_LIVE_DEFAULTS = {
  content: "{role} **{name}** is live on {platform}!",
  title: "{title}",
  description: "**{name}** just went live. Come hang out!",
  button: "Watch on {platform}",
  endedTitle: "⚫ {name} was live on {platform}",
  endedDescription: "**{title}**\nStreamed for **{duration}** · Peak **{peak}** viewers",
  endedColor: "#4E5058",
};

export const GO_LIVE_PLACEHOLDERS = [
  { token: "{name}", description: "The streamer's name" },
  { token: "{user}", description: "Their Discord account, as a mention" },
  { token: "{platform}", description: "Twitch, YouTube, Kick, TikTok…" },
  { token: "{title}", description: "The stream's title" },
  { token: "{game}", description: "The game or category" },
  { token: "{viewers}", description: "How many are watching" },
  { token: "{url}", description: "The stream link" },
  { token: "{role}", description: "The ping role (pings it in the message text)" },
];

// Extra placeholders for the "stream ended" summary.
export const GO_LIVE_ENDED_PLACEHOLDERS = [
  { token: "{duration}", description: "How long they streamed, e.g. 2h 15m" },
  { token: "{peak}", description: "The most viewers at once" },
];

export interface LiveInfo {
  name: string;
  platform: LivePlatform;
  platformName?: string; // for "other", e.g. Facebook
  title?: string | null;
  game?: string | null;
  viewers?: number | null;
  url: string;
  thumbnail?: string | null;
  avatar?: string | null;
  userId?: string | null;
  roleId?: string | null;
  startedAt?: Date | null;
}

export function fillGoLive(text: string, i: LiveInfo): string {
  const p = i.platform === "other" ? i.platformName || "stream" : platformInfo(i.platform).name;
  return text
    .replace(/\{name\}/g, i.name)
    .replace(/\{user\}/g, i.userId ? `<@${i.userId}>` : i.name)
    .replace(/\{platform\}/g, p)
    .replace(/\{title\}/g, i.title || `${i.name} is live`)
    .replace(/\{game\}/g, i.game || "Just Chatting")
    .replace(/\{viewers\}/g, i.viewers != null ? i.viewers.toLocaleString("en-US") : "—")
    .replace(/\{url\}/g, i.url)
    .replace(/\{role\}/g, i.roleId ? `<@&${i.roleId}>` : "");
}

export function durationText(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60000));
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

// The announcement, as plain data both the bot and the preview turn into a message.
export interface GoLiveMessage {
  content: string;
  title: string;
  description: string;
  color: string;
  fields: Array<{ name: string; value: string; inline: boolean }>;
  image: string | null;
  thumbnail: string | null;
  author: { name: string; icon: string | null };
  button: { label: string; url: string; emoji: string | null };
  footer: string;
  ended: boolean;
}

export function buildGoLiveMessage(s: GoLiveSettingsLike, i: LiveInfo, ended?: { peak: number; durationMs: number }): GoLiveMessage {
  const plat = platformInfo(i.platform);
  const color = s.embedColor && /^#[0-9a-f]{6}$/i.test(s.embedColor) ? s.embedColor : plat.color;
  const platName = i.platform === "other" ? i.platformName || "Stream" : plat.name;
  if (ended) {
    const fillEnded = (t: string) => fillGoLive(t.replace(/\{duration\}/g, durationText(ended.durationMs)).replace(/\{peak\}/g, ended.peak ? ended.peak.toLocaleString("en-US") : "—"), i);
    const customText = s.endedDescription?.trim();
    return {
      content: "",
      title: fillEnded(s.endedTitle?.trim() || GO_LIVE_DEFAULTS.endedTitle).slice(0, 256),
      description: customText
        ? fillEnded(customText).slice(0, 4096)
        : [i.title ? `**${i.title}**` : "", `Streamed for **${durationText(ended.durationMs)}**${ended.peak ? ` · Peak **${ended.peak.toLocaleString("en-US")}** viewers` : ""}`].filter(Boolean).join("\n"),
      color: s.endedColor && /^#[0-9a-f]{6}$/i.test(s.endedColor) ? s.endedColor : GO_LIVE_DEFAULTS.endedColor,
      fields: i.game && s.showGame !== false ? [{ name: "Played", value: i.game, inline: true }] : [],
      image: null,
      thumbnail: i.avatar ?? null,
      author: { name: i.name, icon: i.avatar ?? null },
      button: { label: `Visit on ${platName}`, url: i.url, emoji: null },
      footer: `${platName} · Stream ended`,
      ended: true,
    };
  }
  const fields = [
    ...(i.game && s.showGame !== false ? [{ name: "Playing", value: i.game, inline: true }] : []),
    ...(i.viewers != null && s.showViewers !== false ? [{ name: "Viewers", value: i.viewers.toLocaleString("en-US"), inline: true }] : []),
  ];
  return {
    content: fillGoLive(s.contentTemplate?.trim() || GO_LIVE_DEFAULTS.content, i).trim(),
    title: fillGoLive(s.embedTitle?.trim() || GO_LIVE_DEFAULTS.title, i).slice(0, 256),
    description: fillGoLive(s.embedDescription ?? GO_LIVE_DEFAULTS.description, i).slice(0, 4096),
    color,
    fields,
    image: s.showThumbnail === false ? null : i.thumbnail ?? null,
    thumbnail: i.avatar ?? null,
    author: { name: `${i.name} is live on ${platName}`, icon: i.avatar ?? null },
    button: { label: fillGoLive(s.buttonLabel?.trim() || GO_LIVE_DEFAULTS.button, i).slice(0, 80), url: i.url, emoji: s.buttonEmoji?.trim() || null },
    footer: platName,
    ended: false,
  };
}

// The extra embed parts from the dashboard (author, images, footer, fields),
// with placeholders filled in. Empty parts are left out so the defaults stay.
export interface GoLiveExtra {
  authorName?: string;
  authorIconUrl?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  footerText?: string;
  footerIconUrl?: string;
  timestamp?: boolean;
  fields?: Array<{ name: string; value: string; inline: boolean }>;
}

export function fillGoLiveExtra(raw: unknown, i: LiveInfo): GoLiveExtra {
  if (!raw || typeof raw !== "object") return {};
  const e = raw as Record<string, unknown>;
  const str = (k: string) => (typeof e[k] === "string" && (e[k] as string).trim() ? fillGoLive(e[k] as string, i) : undefined);
  const out: GoLiveExtra = {
    authorName: str("authorName"),
    authorIconUrl: str("authorIconUrl"),
    thumbnailUrl: str("thumbnailUrl"),
    imageUrl: str("imageUrl"),
    footerText: str("footerText"),
    footerIconUrl: str("footerIconUrl"),
  };
  if (Array.isArray(e.fields)) {
    out.fields = (e.fields as Array<Record<string, unknown>>)
      .filter((f) => f && (f.name || f.value))
      .slice(0, 20)
      .map((f) => ({ name: fillGoLive(String(f.name || "\u200b"), i).slice(0, 256), value: fillGoLive(String(f.value || "\u200b"), i).slice(0, 1024), inline: !!f.inline }));
  }
  return out;
}
