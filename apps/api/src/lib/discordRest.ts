import fetch from "node-fetch";

const DISCORD_API = "https://discord.com/api/v10";

export interface DiscordChannel {
  id: string;
  name: string;
  type: number; // 0 = text, 2 = voice, 4 = category, 5 = announcement, 15 = forum
  parent_id: string | null;
  position: number;
  topic?: string | null;
  bitrate?: number;
  nsfw?: boolean;
  rate_limit_per_user?: number;
}

export interface DiscordRole {
  id: string;
  name: string;
  color: number;
  position: number;
  hoist?: boolean;
  mentionable?: boolean;
  permissions?: string;
}

// Bot-token REST calls — no gateway connection needed, so the API process
// can serve channel/role pickers without depending on the bot process being
// up. Results are cached briefly per guild to avoid hammering Discord's
// REST rate limits on every dashboard page load.
const channelCache = new Map<string, { data: DiscordChannel[]; expires: number }>();
const roleCache = new Map<string, { data: DiscordRole[]; expires: number }>();
const CACHE_TTL_MS = 10_000;

let botGuildIdsCache: { data: Set<string>; expires: number } | null = null;

// Which guilds the bot itself is currently a member of — used to show
// "installed" vs "not installed" on the dashboard's server picker, which is
// otherwise just the user's manageable guild list regardless of bot presence.
export async function getBotGuildIds(): Promise<Set<string>> {
  if (botGuildIdsCache && botGuildIdsCache.expires > Date.now()) return botGuildIdsCache.data;

  const ids = new Set<string>();
  let after: string | undefined;
  for (let page = 0; page < 10; page++) {
    const res = await fetch(`${DISCORD_API}/users/@me/guilds?limit=200${after ? `&after=${after}` : ""}`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
    });
    if (!res.ok) break;
    const batch = (await res.json()) as Array<{ id: string }>;
    for (const g of batch) ids.add(g.id);
    if (batch.length < 200) break;
    after = batch[batch.length - 1]?.id;
  }

  botGuildIdsCache = { data: ids, expires: Date.now() + CACHE_TTL_MS };
  return ids;
}

export async function getGuildChannels(guildId: string): Promise<DiscordChannel[]> {
  const cached = channelCache.get(guildId);
  if (cached && cached.expires > Date.now()) return cached.data;

  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Discord channels fetch failed: ${res.status}`);

  const data = (await res.json()) as DiscordChannel[];
  channelCache.set(guildId, { data, expires: Date.now() + CACHE_TTL_MS });
  return data;
}

// Bot account identity — username/avatar are on the user object; the
// application's "description" (shown on its Discord invite/store page) is
// a separate, newer endpoint. Both use the same bot token, no OAuth needed.
export interface DiscordBotUser {
  id: string;
  username: string;
  avatar: string | null;
}

// Discord is the source of truth for the bot's actual current username and
// avatar — reading it back here (rather than trusting whatever the
// dashboard last had in local state) is what makes the Bot Customization
// page show the real thing after a refresh instead of resetting to a
// placeholder.
export async function getBotUser(): Promise<DiscordBotUser | null> {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as DiscordBotUser;
}

export async function updateBotUser(fields: { username?: string; avatar?: string | null }): Promise<{ error?: string }> {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    method: "PATCH",
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) return { error: await res.text() };
  return {};
}

export async function updateBotApplication(fields: { description?: string }): Promise<{ error?: string }> {
  const res = await fetch(`${DISCORD_API}/applications/@me`, {
    method: "PATCH",
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) return { error: await res.text() };
  return {};
}

function hexToInt(hex: string): number {
  return parseInt(hex.replace("#", ""), 16) || 0;
}

interface SendPayloadInput {
  content?: string;
  embedEnabled?: boolean;
  embedTitle?: string;
  embedDescription?: string;
  embedColor?: string;
  buttons?: Array<{ label: string; url: string }>;
}

// Raw Discord REST shape (not discord.js builders) — this is called from
// the API process directly, which has no gateway connection, only the bot
// token for REST calls.
export function buildRestMessagePayload(input: SendPayloadInput) {
  const buttons = Array.isArray(input.buttons) ? input.buttons : [];
  const components =
    buttons.length > 0
      ? [
          {
            type: 1,
            components: buttons.map((b) => ({ type: 2, style: 5, label: b.label, url: b.url })),
          },
        ]
      : [];

  if (!input.embedEnabled) {
    return { content: input.content ?? "", embeds: [], components };
  }

  const embed: Record<string, unknown> = {
    description: input.embedDescription || input.content || "",
  };
  if (input.embedTitle) embed.title = input.embedTitle;
  if (input.embedColor) embed.color = hexToInt(input.embedColor);

  return { content: "", embeds: [embed], components };
}

export async function postChannelMessage(channelId: string, payload: unknown): Promise<{ error?: string; id?: string }> {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return { error: await res.text() };
  const message = (await res.json()) as { id: string };
  return { id: message.id };
}

export async function editChannelMessage(channelId: string, messageId: string, payload: unknown): Promise<{ error?: string }> {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages/${messageId}`, {
    method: "PATCH",
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return { error: await res.text() };
  return {};
}

export async function deleteChannelMessage(channelId: string, messageId: string): Promise<void> {
  await fetch(`${DISCORD_API}/channels/${channelId}/messages/${messageId}`, {
    method: "DELETE",
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
  }).catch(() => null);
}

export async function createGuildRole(guildId: string, role: Partial<DiscordRole>): Promise<DiscordRole | null> {
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/roles`, {
    method: "POST",
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: role.name,
      color: role.color,
      hoist: role.hoist,
      mentionable: role.mentionable,
      permissions: role.permissions,
    }),
  });
  if (!res.ok) return null;
  return (await res.json()) as DiscordRole;
}

export async function createGuildChannel(guildId: string, channel: Partial<DiscordChannel>): Promise<DiscordChannel | null> {
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
    method: "POST",
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: channel.name,
      type: channel.type,
      parent_id: channel.parent_id,
      topic: channel.topic,
      bitrate: channel.bitrate,
      nsfw: channel.nsfw,
    }),
  });
  if (!res.ok) return null;
  return (await res.json()) as DiscordChannel;
}

export interface DiscordMemberInfo {
  id: string;
  username: string;
  nickname: string | null;
  avatar: string | null;
}

const memberCache = new Map<string, { data: DiscordMemberInfo | null; expires: number }>();

// Per-user, not per-guild-list — callers only ever need a handful of ids at
// a time (leaderboard rows), so N individual cached lookups beats paging
// through the entire member list to find them.
export async function getGuildMember(guildId: string, userId: string): Promise<DiscordMemberInfo | null> {
  const cacheKey = `${guildId}:${userId}`;
  const cached = memberCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;

  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${userId}`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
  });

  let data: DiscordMemberInfo | null = null;
  if (res.ok) {
    const member = (await res.json()) as { nick: string | null; user: { id: string; username: string; avatar: string | null } };
    data = { id: member.user.id, username: member.user.username, nickname: member.nick, avatar: member.user.avatar };
  }

  memberCache.set(cacheKey, { data, expires: Date.now() + CACHE_TTL_MS });
  return data;
}

export async function setChannelSlowmode(channelId: string, seconds: number): Promise<{ error?: string }> {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}`, {
    method: "PATCH",
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ rate_limit_per_user: seconds }),
  });
  if (!res.ok) return { error: `Discord returned ${res.status}` };
  return {};
}

interface AppCommandOption {
  type: number; // 6 = USER
  name: string;
  description: string;
  required?: boolean;
}

interface AppCommandDef {
  name: string;
  description: string;
  options?: AppCommandOption[];
}

// Per-guild application commands (as opposed to the global, built-in slash
// commands baked into the bot's code) — these register/update/disappear
// near-instantly, unlike global commands which take up to an hour to
// propagate, which matters for a live dashboard command builder.
export async function createGuildApplicationCommand(guildId: string, def: AppCommandDef): Promise<{ id: string } | { error: string }> {
  const res = await fetch(`${DISCORD_API}/applications/${process.env.DISCORD_CLIENT_ID}/guilds/${guildId}/commands`, {
    method: "POST",
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(def),
  });
  if (!res.ok) return { error: await res.text() };
  const data = (await res.json()) as { id: string };
  return { id: data.id };
}

export async function deleteGuildApplicationCommand(guildId: string, commandId: string): Promise<void> {
  await fetch(`${DISCORD_API}/applications/${process.env.DISCORD_CLIENT_ID}/guilds/${guildId}/commands/${commandId}`, {
    method: "DELETE",
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
  }).catch(() => null);
}

// Discord's native "Scheduled Events" (the calendar-integrated tab with
// mobile push reminders and an "Interested" button) — kept in sync
// alongside the dashboard's own RSVP-embed event system, not replacing it.
// EXTERNAL is used unconditionally (rather than picking VOICE/STAGE_INSTANCE
// based on the event's channel) since dashboard events point at a text
// channel for the RSVP embed, which native scheduled events can't target
// directly — EXTERNAL just needs a free-text location and an end time.
interface ScheduledEventFields {
  name: string;
  description?: string;
  scheduledStartTime: string; // ISO 8601
  scheduledEndTime: string; // ISO 8601 — required for EXTERNAL events
  location: string;
}

export async function createGuildScheduledEvent(guildId: string, fields: ScheduledEventFields): Promise<{ id?: string; error?: string }> {
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/scheduled-events`, {
    method: "POST",
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: fields.name.slice(0, 100),
      description: fields.description?.slice(0, 1000),
      scheduled_start_time: fields.scheduledStartTime,
      scheduled_end_time: fields.scheduledEndTime,
      privacy_level: 2, // GUILD_ONLY — the only level Discord currently supports
      entity_type: 3, // EXTERNAL
      entity_metadata: { location: fields.location.slice(0, 100) },
    }),
  });
  if (!res.ok) return { error: await res.text() };
  const data = (await res.json()) as { id: string };
  return { id: data.id };
}

export async function updateGuildScheduledEvent(
  guildId: string,
  eventId: string,
  fields: Partial<ScheduledEventFields>
): Promise<{ error?: string }> {
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/scheduled-events/${eventId}`, {
    method: "PATCH",
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(fields.name !== undefined ? { name: fields.name.slice(0, 100) } : {}),
      ...(fields.description !== undefined ? { description: fields.description.slice(0, 1000) } : {}),
      ...(fields.scheduledStartTime !== undefined ? { scheduled_start_time: fields.scheduledStartTime } : {}),
      ...(fields.scheduledEndTime !== undefined ? { scheduled_end_time: fields.scheduledEndTime } : {}),
      ...(fields.location !== undefined ? { entity_metadata: { location: fields.location.slice(0, 100) } } : {}),
    }),
  });
  if (!res.ok) return { error: await res.text() };
  return {};
}

export async function deleteGuildScheduledEvent(guildId: string, eventId: string): Promise<void> {
  await fetch(`${DISCORD_API}/guilds/${guildId}/scheduled-events/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
  }).catch(() => null);
}

export async function getGuildRoles(guildId: string): Promise<DiscordRole[]> {
  const cached = roleCache.get(guildId);
  if (cached && cached.expires > Date.now()) return cached.data;

  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/roles`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Discord roles fetch failed: ${res.status}`);

  const data = (await res.json()) as DiscordRole[];
  roleCache.set(guildId, { data, expires: Date.now() + CACHE_TTL_MS });
  return data;
}
