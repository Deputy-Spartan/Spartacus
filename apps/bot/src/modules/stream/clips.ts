import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type ButtonInteraction, type Client } from "discord.js";
import fetch from "node-fetch";
import { CLIP_VOTE_PREFIX } from "@spartacus/shared";
import { logError } from "@spartacus/db";
import { prisma } from "../../lib/prisma";
import { isSendableChannel } from "../../lib/channels";
import { isModuleEnabled } from "../../lib/moduleGate";
import { twitchAuth } from "../../lib/livePlatforms";

// New Twitch clips from the streamers a server follows are posted in a
// channel with a vote button, and the most-voted clip of the week gets its own
// post. Twitch is the only platform with a public clips list.

interface TwitchClip {
  id: string;
  url: string;
  title: string;
  creator_name: string;
  broadcaster_name: string;
  view_count: number;
  created_at: string;
  thumbnail_url: string;
}

const CLIP_WINDOW_MS = 30 * 60_000; // only clips made in the last half hour are posted
const idCache = new Map<string, string>(); // login -> Twitch user id

async function twitchGet<T>(path: string): Promise<T | null> {
  const token = await twitchAuth().catch(() => null);
  if (!token || !process.env.TWITCH_CLIENT_ID) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(`https://api.twitch.tv/helix/${path}`, {
      headers: { "Client-Id": process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
      signal: ctrl.signal as never,
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function broadcasterIds(logins: string[]): Promise<Map<string, string>> {
  const need = logins.filter((l) => !idCache.has(l));
  for (let i = 0; i < need.length; i += 100) {
    const chunk = need.slice(i, i + 100);
    const r = await twitchGet<{ data?: Array<{ id: string; login: string }> }>(`users?${chunk.map((l) => `login=${encodeURIComponent(l)}`).join("&")}`);
    for (const u of r?.data ?? []) idCache.set(u.login.toLowerCase(), u.id);
  }
  return new Map(logins.filter((l) => idCache.has(l)).map((l) => [l, idCache.get(l) as string]));
}

async function recentClips(login: string, id: string, since: Date): Promise<TwitchClip[]> {
  const r = await twitchGet<{ data?: TwitchClip[] }>(`clips?broadcaster_id=${id}&started_at=${encodeURIComponent(since.toISOString())}&first=20`);
  void login;
  return r?.data ?? [];
}

export function voteRow(clipRowId: string, votes: number) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${CLIP_VOTE_PREFIX}${clipRowId}`).setLabel(votes === 1 ? "1 vote" : `${votes} votes`).setEmoji("🔥").setStyle(ButtonStyle.Secondary),
  );
}

// Every 5 minutes.
export async function pollClips(client: Client) {
  const configs = await prisma.streamExtrasConfig.findMany({ where: { clipsEnabled: true, clipsChannelId: { not: null } } });
  if (!configs.length) return;
  const since = new Date(Date.now() - CLIP_WINDOW_MS);
  for (const config of configs) {
    try {
      if (!(await isModuleEnabled(config.guildId, "STREAM_EXTRAS"))) continue;
      const channel = await client.channels.fetch(config.clipsChannelId as string).catch(() => null);
      if (!isSendableChannel(channel)) continue;
      const subs = await prisma.streamSubscription.findMany({ where: { guildId: config.guildId, platform: "twitch" }, select: { channelName: true } });
      const logins = [...new Set(subs.map((s) => s.channelName.toLowerCase()))].slice(0, 25);
      if (!logins.length) continue;
      const ids = await broadcasterIds(logins);
      for (const [login, id] of ids) {
        for (const clip of (await recentClips(login, id, since)).reverse()) {
          if (clip.view_count < config.clipsMinViews) continue;
          const exists = await prisma.streamClip.findUnique({ where: { guildId_platform_clipId: { guildId: config.guildId, platform: "twitch", clipId: clip.id } } });
          if (exists) continue;
          // The row goes in first, so a second copy of the bot can't post it twice.
          const row = await prisma.streamClip
            .create({
              data: {
                guildId: config.guildId,
                clipId: clip.id,
                url: clip.url,
                title: clip.title.slice(0, 200),
                creator: clip.creator_name,
                streamer: clip.broadcaster_name,
                thumbnail: clip.thumbnail_url,
                views: clip.view_count,
                clippedAt: new Date(clip.created_at),
              },
            })
            .catch(() => null);
          if (!row) continue;
          const sent = await channel
            .send({
              content: `🎬 **${clip.title.replace(/[*_`~|]/g, "")}**\nClipped by **${clip.creator_name}** on **${clip.broadcaster_name}**'s stream\n${clip.url}`,
              components: [voteRow(row.id, 0)],
              allowedMentions: { parse: [] },
            })
            .catch((err) => {
              logError("bot", err, config.guildId);
              return null;
            });
          if (sent) await prisma.streamClip.update({ where: { id: row.id }, data: { messageId: sent.id, channelId: channel.id } });
          else await prisma.streamClip.delete({ where: { id: row.id } }).catch(() => null);
        }
      }
    } catch (err) {
      logError("bot", err, config.guildId);
    }
  }
}

// Once a week, at 18:00 UTC or later on the chosen day.
export async function postClipOfTheWeek(client: Client, force?: { guildId: string }) {
  const now = new Date();
  const configs = await prisma.streamExtrasConfig.findMany({
    where: force ? { guildId: force.guildId } : { clipsEnabled: true, clipsWeekly: true, clipsChannelId: { not: null } },
  });
  for (const config of configs) {
    try {
      if (!config.clipsChannelId) continue;
      if (!force) {
        if (now.getUTCDay() !== config.clipsWeeklyDay || now.getUTCHours() < 18) continue;
        if (config.lastClipOfWeekAt && now.getTime() - config.lastClipOfWeekAt.getTime() < 5 * 86_400_000) continue;
        if (!(await isModuleEnabled(config.guildId, "STREAM_EXTRAS"))) continue;
      }
      await prisma.streamExtrasConfig.update({ where: { id: config.id }, data: { lastClipOfWeekAt: now } });
      const top = await prisma.streamClip.findFirst({
        where: { guildId: config.guildId, clippedAt: { gte: new Date(now.getTime() - 7 * 86_400_000) }, votes: { gt: 0 } },
        orderBy: [{ votes: "desc" }, { views: "desc" }],
      });
      if (!top) continue;
      const channel = await client.channels.fetch(config.clipsChannelId).catch(() => null);
      if (!isSendableChannel(channel)) continue;
      await channel.send({
        content: `🏆 **Clip of the Week**: **${top.title.replace(/[*_`~|]/g, "")}**\nClipped by **${top.creator ?? "someone"}** on **${top.streamer ?? "a streamer"}**'s stream · ${top.votes} vote${top.votes === 1 ? "" : "s"}\n${top.url}`,
        allowedMentions: { parse: [] },
      });
    } catch (err) {
      logError("bot", err, config.guildId);
    }
  }
}

// The vote button: one vote per person, and tapping again takes it back.
export async function handleClipVote(interaction: ButtonInteraction) {
  const clipRowId = interaction.customId.slice(CLIP_VOTE_PREFIX.length);
  if (!interaction.guildId || !(await isModuleEnabled(interaction.guildId, "STREAM_EXTRAS"))) {
    await interaction.reply({ content: "⚠️ Stream Extras is turned off in this server.", ephemeral: true });
    return;
  }
  const clip = await prisma.streamClip.findUnique({ where: { id: clipRowId } });
  if (!clip || clip.guildId !== interaction.guildId) {
    await interaction.reply({ content: "That clip isn't tracked any more.", ephemeral: true });
    return;
  }
  const where = { clipId_userId: { clipId: clip.id, userId: interaction.user.id } };
  const had = await prisma.streamClipVote.findUnique({ where });
  if (had) await prisma.streamClipVote.delete({ where }).catch(() => null);
  else await prisma.streamClipVote.create({ data: { clipId: clip.id, userId: interaction.user.id } }).catch(() => null);
  const votes = await prisma.streamClipVote.count({ where: { clipId: clip.id } });
  await prisma.streamClip.update({ where: { id: clip.id }, data: { votes } });
  await interaction.update({ components: [voteRow(clip.id, votes)] });
}
