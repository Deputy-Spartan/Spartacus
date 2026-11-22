import { join } from "node:path";
import { existsSync } from "node:fs";
import { EmbedBuilder, MessageFlags, type Client } from "discord.js";
import { prisma } from "@spartacus/db";
import { SOCIAL_PLATFORMS, SOCIAL_PLATFORM_IDS, SOCIALS_POST_DEFAULTS, socialEmojiName, socialUrl, type SocialPlatformId } from "@spartacus/shared";

// Streaming › Socials › Discord post: one message listing your platforms with
// an icon for each. Posted, updated in place, or removed from the dashboard.

const ASSETS = join(__dirname, "../../../assets/socials");
const GOLD = 0xe0a91e;

// The icons are the bot's own emojis (application emojis), uploaded once from
// assets/socials, so they work in every server without using its emoji slots.
let emojiCache: Partial<Record<SocialPlatformId, string>> | null = null;

async function socialEmojis(client: Client): Promise<Partial<Record<SocialPlatformId, string>>> {
  if (emojiCache && Object.keys(emojiCache).length === SOCIAL_PLATFORM_IDS.length) return emojiCache;
  const out: Partial<Record<SocialPlatformId, string>> = {};
  try {
    const app = client.application;
    if (!app) return out;
    const have = await app.emojis.fetch();
    for (const id of SOCIAL_PLATFORM_IDS) {
      const name = socialEmojiName(id);
      let emoji = have.find((e) => e.name === name);
      const file = join(ASSETS, `${id}.png`);
      if (!emoji && existsSync(file)) emoji = await app.emojis.create({ attachment: file, name }).catch(() => undefined);
      if (emoji) out[id] = `<:${name}:${emoji.id}>`;
    }
  } catch (err) {
    console.warn("[socials] couldn't load the platform emojis:", err);
  }
  emojiCache = out;
  return out;
}

type Row = { id: string; on?: boolean; name?: string; post?: boolean; url?: string };

function postedPlatforms(platforms: unknown) {
  const rows = (Array.isArray(platforms) ? platforms : []) as Row[];
  return rows
    .filter((r) => (SOCIAL_PLATFORM_IDS as readonly string[]).includes(r.id) && (r.post ?? r.on) && (r.name ?? "").trim())
    .map((r) => {
      const name = (r.name ?? "").trim();
      return { p: SOCIAL_PLATFORMS[r.id as SocialPlatformId], name, url: socialUrl(r.id as SocialPlatformId, name, r.url) };
    });
}

export async function buildSocialsPost(client: Client, guildId: string) {
  const s = await prisma.socialsOverlay.findUnique({ where: { guildId } });
  if (!s) return null;
  const list = postedPlatforms(s.platforms);
  if (!list.length) return null;
  const emojis = await socialEmojis(client);
  const guild = client.guilds.cache.get(guildId);
  const title = s.postTitle?.trim() || SOCIALS_POST_DEFAULTS.title;
  const text = s.postText ?? SOCIALS_POST_DEFAULTS.text;
  const icon = (id: SocialPlatformId) => (emojis[id] ? `${emojis[id]} ` : "");

  if (s.postStyle === "plain") {
    const lines = list.map(({ p, url }) => `${icon(p.id)}**${p.label}** ・ ${url}`);
    const content = [`## ${title}`, ...lines, text.trim() ? `-# ${text.trim()}` : ""].filter(Boolean).join("\n");
    // Link previews off, so the list stays one clean message.
    return { settings: s, payload: { content: content.slice(0, 2000), embeds: [] as EmbedBuilder[], suppress: true } };
  }

  const embed = new EmbedBuilder()
    .setColor(GOLD)
    .setTitle(title.slice(0, 256))
    .addFields(
      list.map(({ p, name, url }) => ({
        name: `${icon(p.id)}${p.label}`,
        value: `[${(p.id === "discord" ? "Join the server" : name).replace(/[[\]]/g, "")}](${url})`,
        inline: true,
      })),
    );
  if (text.trim()) embed.setDescription(text.trim().slice(0, 4000));
  const thumb = guild?.iconURL({ size: 256 }) ?? client.user?.displayAvatarURL({ size: 256 });
  if (thumb) embed.setThumbnail(thumb);
  if (guild) embed.setFooter({ text: guild.name, iconURL: guild.iconURL({ size: 64 }) ?? undefined });
  return { settings: s, payload: { content: "", embeds: [embed], suppress: false } };
}

// Posts the message, or updates the one already posted. Returns a link to it.
export async function postSocials(client: Client, guildId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const built = await buildSocialsPost(client, guildId);
  if (!built) return { ok: false, error: "Tick at least one platform for the post and type its name." };
  const { settings: s, payload } = built;
  if (!s.postChannelId) return { ok: false, error: "Pick a channel for the post first." };

  const channel = await client.channels.fetch(s.postChannelId).catch(() => null);
  if (!channel?.isTextBased() || !("send" in channel)) return { ok: false, error: "Spartacus can't see that channel. Check it can view and send messages there." };

  // Moved to another channel: take down the old post.
  if (s.postMessageId && s.postedChannelId && s.postedChannelId !== s.postChannelId) {
    const old = await client.channels.fetch(s.postedChannelId).catch(() => null);
    if (old?.isTextBased()) await old.messages.delete(s.postMessageId).catch(() => null);
  }

  // Plain posts hide link previews. Editing back to an embed has to clear that,
  // or the embed itself would be hidden.
  const { content, embeds, suppress } = payload;
  let message = null;
  if (s.postMessageId && s.postedChannelId === s.postChannelId) {
    const existing = await channel.messages.fetch(s.postMessageId).catch(() => null);
    if (existing) message = await existing.edit({ content, embeds, flags: suppress ? MessageFlags.SuppressEmbeds : [] }).catch(() => null);
  }
  if (!message) {
    message = await channel.send({ content, embeds, ...(suppress ? { flags: MessageFlags.SuppressEmbeds as const } : {}) }).catch((err: unknown) => {
      console.warn("[socials] post failed:", err);
      return null;
    });
  }
  if (!message) return { ok: false, error: "Discord didn't accept the post. Check Spartacus can send messages and embed links in that channel." };

  await prisma.socialsOverlay.update({ where: { guildId }, data: { postMessageId: message.id, postedChannelId: channel.id } });
  return { ok: true, url: message.url };
}

export async function removeSocialsPost(client: Client, guildId: string) {
  const s = await prisma.socialsOverlay.findUnique({ where: { guildId } });
  if (s?.postMessageId && s.postedChannelId) {
    const channel = await client.channels.fetch(s.postedChannelId).catch(() => null);
    if (channel?.isTextBased()) await channel.messages.delete(s.postMessageId).catch(() => null);
  }
  if (s) await prisma.socialsOverlay.update({ where: { guildId }, data: { postMessageId: null, postedChannelId: null } });
}
