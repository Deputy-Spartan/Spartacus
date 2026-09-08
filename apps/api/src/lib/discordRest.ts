import fetch from "node-fetch";

const DISCORD_API = "https://discord.com/api/v10";

export interface DiscordChannel {
  id: string;
  name: string;
  type: number; // 0 = text, 2 = voice, 4 = category, 5 = announcement, 15 = forum
  parent_id: string | null;
  position: number;
}

export interface DiscordRole {
  id: string;
  name: string;
  color: number;
  position: number;
}

// Bot-token REST calls — no gateway connection needed, so the API process
// can serve channel/role pickers without depending on the bot process being
// up. Results are cached briefly per guild to avoid hammering Discord's
// REST rate limits on every dashboard page load.
const channelCache = new Map<string, { data: DiscordChannel[]; expires: number }>();
const roleCache = new Map<string, { data: DiscordRole[]; expires: number }>();
const CACHE_TTL_MS = 30_000;

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
