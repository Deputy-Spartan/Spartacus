import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import fetch from "node-fetch";
import type { StreamerAccount } from "@prisma/client";
import { KICK_EVENTS, KICK_SCOPES, TWITCH_SCOPES } from "@spartacus/shared";
import { logError } from "@spartacus/db";
import { prisma } from "../../lib/prisma";

// A streamer's own Twitch or Kick login, connected once from the dashboard.
// With it the bot can change their title and game (/title), count new
// followers for the recap, and (Kick) hear their chat and follows through
// Kick's webhooks. Tokens are stored encrypted with a key made from
// NEXTAUTH_SECRET, and refreshed before they run out.

export type AccountPlatform = "twitch" | "kick";

// ---- encryption ----
function key() {
  return createHash("sha256").update(`${process.env.NEXTAUTH_SECRET ?? "spartacus"}:streamer-accounts`).digest();
}
export function seal(text: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return `v1:${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${data.toString("base64")}`;
}
export function unseal(sealed: string): string {
  const [v, iv, tag, data] = sealed.split(":");
  if (v !== "v1") return sealed;
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

// ---- where Twitch and Kick send people back to ----
export function apiBase(): string {
  if (process.env.API_PUBLIC_URL) return process.env.API_PUBLIC_URL.replace(/\/+$/, "");
  try {
    return new URL(process.env.DISCORD_REDIRECT_URI ?? "").origin;
  } catch {
    return "http://localhost:3001";
  }
}
export const redirectUri = (p: AccountPlatform) => `${apiBase()}/auth/stream/${p}/callback`;

export function platformKeys(p: AccountPlatform): boolean {
  return p === "twitch" ? !!(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET) : !!(process.env.KICK_CLIENT_ID && process.env.KICK_CLIENT_SECRET);
}

async function call(url: string, init: { method?: string; headers?: Record<string, string>; body?: string | URLSearchParams } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal as never });
  } finally {
    clearTimeout(t);
  }
}

// ---- connecting ----
interface Pending {
  guildId: string;
  discordUserId: string;
  platform: AccountPlatform;
  verifier: string;
  at: number;
}
const pending = new Map<string, Pending>();

export function startConnect(guildId: string, discordUserId: string, platform: AccountPlatform): { url?: string; error?: string } {
  if (!platformKeys(platform)) return { error: platform === "twitch" ? "Twitch isn't set up on the bot yet (TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET)." : "Kick isn't set up on the bot yet (KICK_CLIENT_ID and KICK_CLIENT_SECRET)." };
  for (const [k, v] of pending) if (Date.now() - v.at > 15 * 60_000) pending.delete(k);
  const state = randomBytes(18).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  pending.set(state, { guildId, discordUserId, platform, verifier, at: Date.now() });
  if (platform === "twitch") {
    const q = new URLSearchParams({ client_id: process.env.TWITCH_CLIENT_ID as string, redirect_uri: redirectUri("twitch"), response_type: "code", scope: TWITCH_SCOPES.join(" "), state, force_verify: "true" });
    return { url: `https://id.twitch.tv/oauth2/authorize?${q}` };
  }
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const q = new URLSearchParams({
    response_type: "code",
    client_id: process.env.KICK_CLIENT_ID as string,
    redirect_uri: redirectUri("kick"),
    scope: KICK_SCOPES.join(" "),
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });
  return { url: `https://id.kick.com/oauth/authorize?${q}` };
}

interface TokenReply {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string | string[];
}

async function exchange(p: AccountPlatform, body: Record<string, string>): Promise<TokenReply | null> {
  const url = p === "twitch" ? "https://id.twitch.tv/oauth2/token" : "https://id.kick.com/oauth/token";
  const creds = p === "twitch" ? { client_id: process.env.TWITCH_CLIENT_ID ?? "", client_secret: process.env.TWITCH_CLIENT_SECRET ?? "" } : { client_id: process.env.KICK_CLIENT_ID ?? "", client_secret: process.env.KICK_CLIENT_SECRET ?? "" };
  const res = await call(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...creds, ...body }) }).catch(() => null);
  if (!res?.ok) {
    if (res) console.error(`[accounts] ${p} token call failed:`, res.status, await res.text().catch(() => ""));
    return null;
  }
  return (await res.json()) as TokenReply;
}

export async function finishConnect(platform: AccountPlatform, code: string, state: string): Promise<{ guildId?: string; login?: string; error?: string }> {
  const p = pending.get(state);
  pending.delete(state);
  if (!p || p.platform !== platform) return { error: "That sign-in link ran out. Press Connect again." };
  const body: Record<string, string> = { grant_type: "authorization_code", code, redirect_uri: redirectUri(platform) };
  if (platform === "kick") body.code_verifier = p.verifier;
  const tok = await exchange(platform, body);
  if (!tok?.access_token) return { guildId: p.guildId, error: `${platform === "twitch" ? "Twitch" : "Kick"} didn't accept the sign-in. Try again.` };
  const who = platform === "twitch" ? await twitchMe(tok.access_token) : await kickMe(tok.access_token);
  if (!who) return { guildId: p.guildId, error: "Couldn't read your channel. Try again." };
  const data = {
    guildId: p.guildId,
    discordUserId: p.discordUserId,
    platform,
    platformId: who.id,
    login: who.login.toLowerCase(),
    displayName: who.name,
    accessToken: seal(tok.access_token),
    refreshToken: tok.refresh_token ? seal(tok.refresh_token) : null,
    expiresAt: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : null,
    scopes: Array.isArray(tok.scope) ? tok.scope.join(" ") : (tok.scope ?? null),
  };
  const account = await prisma.streamerAccount.upsert({
    where: { guildId_platform_platformId: { guildId: p.guildId, platform, platformId: who.id } },
    create: data,
    update: data,
  });
  if (platform === "kick") await subscribeKickEvents(account).catch((e) => logError("bot", e, p.guildId));
  return { guildId: p.guildId, login: who.login };
}

// ---- tokens ----
async function token(a: StreamerAccount): Promise<string | null> {
  if (!a.expiresAt || a.expiresAt.getTime() > Date.now() + 5 * 60_000) return unseal(a.accessToken);
  if (!a.refreshToken) return null;
  const tok = await exchange(a.platform as AccountPlatform, { grant_type: "refresh_token", refresh_token: unseal(a.refreshToken) });
  if (!tok?.access_token) return null;
  await prisma.streamerAccount.update({
    where: { id: a.id },
    data: {
      accessToken: seal(tok.access_token),
      refreshToken: tok.refresh_token ? seal(tok.refresh_token) : a.refreshToken,
      expiresAt: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : null,
    },
  });
  return tok.access_token;
}

const twitchHeaders = (t: string) => ({ "Client-Id": process.env.TWITCH_CLIENT_ID as string, Authorization: `Bearer ${t}` });
const kickHeaders = (t: string) => ({ Authorization: `Bearer ${t}`, Accept: "application/json" });

async function twitchMe(t: string) {
  const res = await call("https://api.twitch.tv/helix/users", { headers: twitchHeaders(t) }).catch(() => null);
  const u = res?.ok ? ((await res.json()) as { data?: Array<{ id: string; login: string; display_name: string }> }).data?.[0] : null;
  return u ? { id: u.id, login: u.login, name: u.display_name } : null;
}

async function kickMe(t: string) {
  const res = await call("https://api.kick.com/public/v1/channels", { headers: kickHeaders(t) }).catch(() => null);
  const c = res?.ok ? ((await res.json()) as { data?: Array<{ broadcaster_user_id: number; slug: string }> }).data?.[0] : null;
  if (!c) return null;
  const ures = await call("https://api.kick.com/public/v1/users", { headers: kickHeaders(t) }).catch(() => null);
  const u = ures?.ok ? ((await ures.json()) as { data?: Array<{ name?: string }> }).data?.[0] : null;
  return { id: String(c.broadcaster_user_id), login: c.slug, name: u?.name ?? c.slug };
}

// ---- Kick webhooks (chat and follows) ----
export async function subscribeKickEvents(a: StreamerAccount): Promise<string | null> {
  const t = await token(a);
  if (!t) return "The Kick sign-in has run out. Connect Kick again.";
  const res = await call("https://api.kick.com/public/v1/events/subscriptions", {
    method: "POST",
    headers: { ...kickHeaders(t), "Content-Type": "application/json" },
    body: JSON.stringify({ method: "webhook", events: KICK_EVENTS.map((name) => ({ name, version: 1 })) }),
  }).catch(() => null);
  if (!res) return "Kick didn't answer.";
  if (!res.ok) return `Kick said ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`;
  const j = (await res.json().catch(() => null)) as { data?: Array<{ name: string; error?: string }> } | null;
  const bad = (j?.data ?? []).filter((d) => d.error && !/already/i.test(d.error));
  return bad.length ? bad.map((d) => `${d.name}: ${d.error}`).join("; ") : null;
}

// Kick drops a subscription if deliveries keep failing for a day, so every
// connected Kick account is subscribed again once a day.
export async function resubscribeAllKick() {
  const accounts = await prisma.streamerAccount.findMany({ where: { platform: "kick" } });
  const done = new Set<string>();
  for (const a of accounts) {
    if (done.has(a.platformId)) continue;
    done.add(a.platformId);
    await subscribeKickEvents(a).catch(() => null);
  }
}

// ---- disconnecting ----
export async function disconnect(id: string) {
  const a = await prisma.streamerAccount.findUnique({ where: { id } });
  if (!a) return;
  await prisma.streamerAccount.delete({ where: { id } });
  // Only tell the platform if no other server still uses this login.
  if (await prisma.streamerAccount.count({ where: { platform: a.platform, platformId: a.platformId } })) return;
  try {
    const t = unseal(a.accessToken);
    if (a.platform === "twitch") {
      await call("https://id.twitch.tv/oauth2/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: process.env.TWITCH_CLIENT_ID ?? "", token: t }) });
    } else {
      const list = await call("https://api.kick.com/public/v1/events/subscriptions", { headers: kickHeaders(t) });
      const ids = list.ok ? (((await list.json()) as { data?: Array<{ id: string }> }).data ?? []).map((s) => s.id) : [];
      if (ids.length) await call(`https://api.kick.com/public/v1/events/subscriptions?${ids.map((i) => `id=${encodeURIComponent(i)}`).join("&")}`, { method: "DELETE", headers: kickHeaders(t) });
      await call(`https://id.kick.com/oauth/revoke?token=${encodeURIComponent(t)}&token_hint_type=access_token`, { method: "POST" });
    }
  } catch {
    // The login is gone from here either way.
  }
}

// ---- what the accounts are for ----

// Changes the stream title and/or game. Game names are looked up on the
// platform, and the closest match is used.
export async function setTitle(a: StreamerAccount, title: string | null, game: string | null): Promise<{ ok: boolean; error?: string; game?: string | null }> {
  const t = await token(a);
  if (!t) return { ok: false, error: `The ${a.platform === "twitch" ? "Twitch" : "Kick"} sign-in has run out. Connect it again on the dashboard.` };
  if (a.platform === "twitch") {
    const body: Record<string, string> = {};
    let gameName: string | null = null;
    if (title) body.title = title.slice(0, 140);
    if (game) {
      const r = await call(`https://api.twitch.tv/helix/search/categories?query=${encodeURIComponent(game)}&first=1`, { headers: twitchHeaders(t) }).catch(() => null);
      const g = r?.ok ? ((await r.json()) as { data?: Array<{ id: string; name: string }> }).data?.[0] : null;
      if (!g) return { ok: false, error: `Twitch has no game called "${game}".` };
      body.game_id = g.id;
      gameName = g.name;
    }
    const res = await call(`https://api.twitch.tv/helix/channels?broadcaster_id=${a.platformId}`, { method: "PATCH", headers: { ...twitchHeaders(t), "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (!res || !res.ok) return { ok: false, error: `Twitch said ${res?.status ?? "nothing"}.` };
    return { ok: true, game: gameName };
  }
  const body: Record<string, string | number> = {};
  let gameName: string | null = null;
  if (title) body.stream_title = title.slice(0, 140);
  if (game) {
    const g = await kickCategory(t, game);
    if (!g) return { ok: false, error: `Kick has no category called "${game}".` };
    body.category_id = g.id;
    gameName = g.name;
  }
  const res = await call("https://api.kick.com/public/v1/channels", { method: "PATCH", headers: { ...kickHeaders(t), "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (!res || !res.ok) return { ok: false, error: `Kick said ${res?.status ?? "nothing"}.` };
  return { ok: true, game: gameName };
}

async function kickCategory(t: string, name: string): Promise<{ id: number; name: string } | null> {
  const pick = (list: Array<{ id: number; name: string }>) => list.find((c) => c.name.toLowerCase() === name.toLowerCase()) ?? list[0] ?? null;
  if (name.length >= 3) {
    const r = await call(`https://api.kick.com/public/v2/categories?name=${encodeURIComponent(name)}&limit=10`, { headers: kickHeaders(t) }).catch(() => null);
    const list = r?.ok ? (((await r.json()) as { data?: Array<{ id: number; name: string }> }).data ?? []) : [];
    if (list.length) return pick(list);
  }
  // The older search, which matches part of a name.
  const r = await call(`https://api.kick.com/public/v1/categories?q=${encodeURIComponent(name)}`, { headers: kickHeaders(t) }).catch(() => null);
  const list = r?.ok ? (((await r.json()) as { data?: Array<{ id: number; name: string }> }).data ?? []) : [];
  return pick(list);
}

// Twitch's follower total (Kick follows are counted from its webhooks instead).
export async function followerTotal(a: StreamerAccount): Promise<number | null> {
  if (a.platform !== "twitch") return null;
  const t = await token(a).catch(() => null);
  if (!t) return null;
  const r = await call(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${a.platformId}&first=1`, { headers: twitchHeaders(t) }).catch(() => null);
  if (!r?.ok) return null;
  const j = (await r.json()) as { total?: number };
  return typeof j.total === "number" ? j.total : null;
}

// The connected account behind a Going Live entry, if there is one.
export async function accountFor(guildId: string, platform: string, login: string) {
  if (platform !== "twitch" && platform !== "kick") return null;
  return prisma.streamerAccount.findFirst({ where: { guildId, platform, login: login.toLowerCase() } });
}
