import fetch from "node-fetch";
import { applyEmbedExtraRest } from "./embedExtra";

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
  embedExtra?: unknown;
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
  applyEmbedExtraRest(embed, input.embedExtra);

  return { content: "", embeds: [embed], components };
}

// Opens (or reuses) a DM channel with a user and sends them a message —
// bots can only DM someone they share a server with, which is guaranteed
// here since this is only ever used to message the dashboard owner, who
// by definition is in the server(s) running this bot.
export async function sendDirectMessage(userId: string, payload: unknown): Promise<{ error?: string; id?: string }> {
  const dmRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
    method: "POST",
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient_id: userId }),
  });
  if (!dmRes.ok) return { error: await dmRes.text() };
  const dmChannel = (await dmRes.json()) as { id: string };
  return postChannelMessage(dmChannel.id, payload);
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

export interface RawDiscordMessage {
  id: string;
  channel_id: string;
  content: string;
  embeds: Array<Record<string, unknown>>;
  components?: Array<Record<string, unknown>>;
  webhook_id?: string;
}

export async function getChannelMessage(channelId: string, messageId: string): Promise<RawDiscordMessage | { error: string }> {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages/${messageId}`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
  });
  if (!res.ok) return { error: await res.text() };
  return (await res.json()) as RawDiscordMessage;
}

// Every Embed Creator "message link" the dashboard accepts is Discord's own
// standard https://discord.com/channels/<guild>/<channel>/<message> format —
// this is the one place that parses it, so both the fetch and update routes
// agree on what counts as valid.
export function parseMessageLink(link: string): { guildId: string; channelId: string; messageId: string } | null {
  const m = link.trim().match(/discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)/);
  if (!m) return null;
  return { guildId: m[1], channelId: m[2], messageId: m[3] };
}

// Webhooks carry their own destination (id + token) baked into the URL —
// unlike everything else in this file, a webhook can point at a channel in
// any server the pasting admin manages, not just the one they're on in the
// dashboard right now. That's intentional and matches how Discord webhooks
// (and tools like Discohook) already work.
export function parseWebhookUrl(url: string): { id: string; token: string } | null {
  const m = url.trim().match(/\/webhooks\/(\d+)\/([\w-]+)/);
  if (!m) return null;
  return { id: m[1], token: m[2] };
}

export async function executeWebhook(
  webhookUrl: string,
  payload: { content?: string; username?: string; avatar_url?: string; embeds?: unknown[]; components?: unknown[] }
): Promise<{ error?: string; id?: string }> {
  const parsed = parseWebhookUrl(webhookUrl);
  if (!parsed) return { error: "That doesn't look like a valid Discord webhook URL." };
  const res = await fetch(`${DISCORD_API}/webhooks/${parsed.id}/${parsed.token}?wait=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return { error: await res.text() };
  const message = (await res.json()) as { id: string };
  return { id: message.id };
}

export async function editWebhookMessage(
  webhookUrl: string,
  messageId: string,
  payload: { content?: string; embeds?: unknown[]; components?: unknown[] }
): Promise<{ error?: string }> {
  const parsed = parseWebhookUrl(webhookUrl);
  if (!parsed) return { error: "That doesn't look like a valid Discord webhook URL." };
  const res = await fetch(`${DISCORD_API}/webhooks/${parsed.id}/${parsed.token}/messages/${messageId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return { error: await res.text() };
  return {};
}

export async function getWebhookMessage(webhookUrl: string, messageId: string): Promise<RawDiscordMessage | { error: string }> {
  const parsed = parseWebhookUrl(webhookUrl);
  if (!parsed) return { error: "That doesn't look like a valid Discord webhook URL." };
  const res = await fetch(`${DISCORD_API}/webhooks/${parsed.id}/${parsed.token}/messages/${messageId}`);
  if (!res.ok) return { error: await res.text() };
  return (await res.json()) as RawDiscordMessage;
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

// Discord's CDN only ever hosts a file that's actually attached to a real
// message — there's no plain "upload a file, get a URL" endpoint. So the
// dashboard's "upload an image" controls need somewhere to post that
// message; this creates (once per guild, then reuses) a text channel
// hidden from @everyone specifically to host those attachments.
async function getOrCreateAssetChannel(guildId: string): Promise<string | null> {
  const { prisma } = await import("@spartacus/db");
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });
  if (guild?.assetChannelId) {
    const check = await fetch(`${DISCORD_API}/channels/${guild.assetChannelId}`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
    });
    if (check.ok) return guild.assetChannelId;
  }

  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
    method: "POST",
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "spartacus-uploads",
      type: 0,
      topic: "Hidden storage for images uploaded from the dashboard — safe to leave alone.",
      permission_overwrites: [{ id: guildId, type: 0, deny: "1024" }], // 1024 = VIEW_CHANNEL, denied for @everyone
    }),
  });
  if (!res.ok) return null;
  const created = (await res.json()) as { id: string };
  await prisma.guild.update({ where: { id: guildId }, data: { assetChannelId: created.id } }).catch(() => null);
  return created.id;
}

export async function uploadImageAsset(
  guildId: string,
  file: { buffer: Buffer; filename: string; mimetype: string }
): Promise<{ url?: string; error?: string }> {
  const channelId = await getOrCreateAssetChannel(guildId);
  if (!channelId) return { error: "Couldn't create a storage channel for uploads — check the bot has Manage Channels." };

  // Uses the runtime's native fetch/FormData/Blob (Node 18+) rather than the
  // node-fetch import used everywhere else in this file — node-fetch v3
  // doesn't implement the WHATWG FormData multipart body these need.
  const form = new FormData();
  form.append("payload_json", JSON.stringify({ content: "📎 Uploaded from the dashboard" }));
  form.append("files[0]", new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), file.filename);

  const res = await globalThis.fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
    body: form,
  });
  if (!res.ok) return { error: (await res.text().catch(() => "")) || `Discord returned ${res.status}` };

  const message = (await res.json()) as { attachments?: Array<{ url: string }> };
  const url = message.attachments?.[0]?.url;
  return url ? { url } : { error: "Upload succeeded but Discord didn't return a file URL." };
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

// Discord rate-limits a single channel to ~2 renames per 10 minutes — this
// surfaces that as a real error message instead of the caller having to
// guess why a rename silently did nothing.
export async function setChannelName(channelId: string, name: string): Promise<{ error?: string }> {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}`, {
    method: "PATCH",
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    if (res.status === 429) return { error: "Discord is rate-limiting renames on this channel — wait a few minutes and try again." };
    return { error: (await res.text().catch(() => "")) || `Discord returned ${res.status}` };
  }
  return {};
}

export interface GuildCounts {
  memberCount: number;
  boostCount: number;
}

// Pure REST — works from the API process without needing the bot's live
// gateway connection, using Discord's own approximate member count that
// GET /guilds/:id?with_counts=true returns.
export async function getGuildCounts(guildId: string): Promise<GuildCounts | null> {
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}?with_counts=true`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { approximate_member_count?: number; premium_subscription_count?: number };
  return { memberCount: data.approximate_member_count ?? 0, boostCount: data.premium_subscription_count ?? 0 };
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

interface TicketPanelForPost {
  id: string;
  name: string;
  description: string | null;
  buttonLabel: string;
  layout: string;
}

interface TicketTypeForPost {
  id: string;
  name: string;
  emoji: string | null;
  description: string | null;
}

// Mirrors apps/bot/src/jobs/ticketPanelPoster.ts's message shape, but posted
// immediately via REST right after the panel is created/edited on the
// dashboard instead of waiting for that job's next once-a-minute tick.
// `savedEmbeds` (already resolved from the panel's savedEmbedId, if set)
// replaces the default name/description embed — the open-ticket
// button/select row is always required, so it's built the same either way.
export function buildTicketPanelPayload(panel: TicketPanelForPost, types: TicketTypeForPost[], savedEmbeds?: Array<Record<string, unknown>>) {
  const embeds = savedEmbeds?.length
    ? savedEmbeds
    : [
        {
          color: 0x3b82f6,
          title: panel.name,
          description: panel.description || "Click below to open a ticket.",
        },
      ];

  let component: Record<string, unknown>;

  if (types.length === 0) {
    component = {
      type: 1,
      components: [{ type: 2, style: 1, custom_id: `ticketpanel:${panel.id}`, label: panel.buttonLabel }],
    };
  } else if (panel.layout === "DROPDOWN") {
    component = {
      type: 1,
      components: [
        {
          type: 3,
          custom_id: `ticketpanel:${panel.id}`,
          placeholder: "Select a ticket type…",
          options: types.map((t) => ({
            label: t.name,
            value: t.id,
            emoji: t.emoji ? { name: t.emoji } : undefined,
            description: t.description?.slice(0, 100) || undefined,
          })),
        },
      ],
    };
  } else {
    component = {
      type: 1,
      components: types.slice(0, 5).map((t) => ({
        type: 2,
        style: 1,
        custom_id: `ticketpanel:${panel.id}:${t.id}`,
        label: t.name,
        emoji: t.emoji ? { name: t.emoji } : undefined,
      })),
    };
  }

  return { embeds, components: [component] };
}

interface RawMessage {
  author: { username: string };
  content: string;
  timestamp: string;
}

// Pure REST — lets the dashboard generate a transcript on demand (e.g. for a
// ticket that's still open, or to re-post one to a different channel)
// without depending on the bot's gateway connection. Discord message
// content is only readable this way for channels the bot can see, same as
// the bot process itself.
export async function fetchChannelTranscriptText(channelId: string): Promise<{ text?: string; error?: string }> {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages?limit=100`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
  });
  if (!res.ok) return { error: res.status === 403 ? "The bot can't see that channel." : `Discord returned ${res.status}` };

  const raw = (await res.json()) as RawMessage[];
  const ordered = [...raw].reverse();
  const text = ordered
    .map((m) => `[${m.timestamp.slice(11, 19)}] ${m.author.username}: ${m.content || "[no text content]"}`)
    .join("\n");
  return { text: text || "(No messages in this channel.)" };
}

// Discord message content caps at 2000 characters — a generated transcript
// that fits goes as one message; a longer one is truncated with a note
// rather than silently cut off or requiring multipart file-upload plumbing
// this REST-only path doesn't have.
export async function postTranscriptMessage(channelId: string, header: string, text: string): Promise<{ error?: string; id?: string }> {
  const budget = 1900 - header.length;
  const body = text.length > budget ? `${text.slice(-budget)}\n\n…(truncated to the most recent messages)` : text;
  return postChannelMessage(channelId, { content: `${header}\n\`\`\`\n${body}\n\`\`\`` });
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

export interface DiscordGuildEmoji {
  id: string;
  name: string;
  animated: boolean;
}

export async function getGuildEmojis(guildId: string): Promise<DiscordGuildEmoji[]> {
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/emojis`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Discord emojis fetch failed: ${res.status}`);
  const data = (await res.json()) as Array<{ id: string; name: string; animated?: boolean }>;
  return data.map((e) => ({ id: e.id, name: e.name, animated: Boolean(e.animated) }));
}
