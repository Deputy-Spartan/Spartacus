import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type Client } from "discord.js";
import type { StreamFriend, StreamSubscription } from "@prisma/client";
import { durationText, platformInfo, type LivePlatform } from "@spartacus/shared";
import { logError } from "@spartacus/db";
import { prisma } from "../../lib/prisma";
import { isSendableChannel } from "../../lib/channels";
import { isModuleEnabled } from "../../lib/moduleGate";
import { claimEvent } from "../../lib/eventClaims";
import type { LiveCheck } from "../../lib/livePlatforms";
import { checkers } from "../community/goLive";

// Friends & raids: streamers you're friends with (not your members, so no
// going-live alerts with pings). When one goes live a quiet post goes in the
// raid channel, and when one of your own streams ends you get a list of who's
// live to raid, smallest first, since a raid means the most to them.

const GOLD = 0xffd700;
const clean = (s: string) => s.replace(/[*_`~|]/g, "");
const nameOf = (f: Pick<StreamFriend, "displayName" | "handle">) => f.displayName || f.handle.replace(/^@/, "");
const urlOf = (f: Pick<StreamFriend, "platform" | "handle" | "lastUrl">) => f.lastUrl || platformInfo(f.platform).url(f.handle);

function watchRow(url: string, label = "Watch") {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(url));
}

function friendLiveEmbed(f: StreamFriend) {
  const p = platformInfo(f.platform);
  const e = new EmbedBuilder()
    .setColor(GOLD)
    .setAuthor({ name: `${p.emoji} ${nameOf(f)} is live on ${p.name}`, iconURL: f.lastAvatar || undefined, url: urlOf(f) })
    .setTitle((f.lastTitle || "Live now").slice(0, 256))
    .setURL(urlOf(f))
    .setFooter({ text: "A friend of the stream · go show some love" });
  const bits = [f.lastGame ? `🎮 ${clean(f.lastGame)}` : null, typeof f.lastViewers === "number" ? `👁 ${f.lastViewers}` : null].filter(Boolean);
  if (bits.length) e.setDescription(bits.join("  ·  "));
  if (f.lastAvatar) e.setThumbnail(f.lastAvatar);
  return e;
}

// Every 2 minutes, after the Going Live check.
export async function pollFriends(client: Client) {
  const all = await prisma.streamFriend.findMany({ take: 1000 });
  if (!all.length) return;
  const on = new Map<string, boolean>();
  const active: StreamFriend[] = [];
  for (const f of all) {
    if (!on.has(f.guildId)) on.set(f.guildId, await isModuleEnabled(f.guildId, "STREAM_GROWTH"));
    if (on.get(f.guildId)) active.push(f);
  }
  const twitch = await checkers.twitch([...new Set(active.filter((f) => f.platform === "twitch").map((f) => f.handle.toLowerCase()))]).catch(() => new Map<string, LiveCheck>());
  const others = new Map<string, LiveCheck>();
  const keys = [...new Set(active.filter((f) => f.platform !== "twitch").map((f) => `${f.platform}:${f.handle}`))];
  for (let i = 0; i < keys.length; i += 4) {
    await Promise.all(
      keys.slice(i, i + 4).map(async (k) => {
        const [p, ...rest] = k.split(":");
        const h = rest.join(":");
        const r = await (p === "youtube" ? checkers.youtube(h) : p === "kick" ? checkers.kick(h) : checkers.tiktok(h)).catch((e) => ({ live: false, error: String(e) }) as LiveCheck);
        others.set(k, r);
      }),
    );
  }
  const configs = new Map((await prisma.streamGrowthConfig.findMany({ where: { guildId: { in: [...new Set(active.map((f) => f.guildId))] } } })).map((c) => [c.guildId, c]));
  for (const f of active) {
    const check = f.platform === "twitch" ? twitch.get(f.handle.toLowerCase()) : others.get(`${f.platform}:${f.handle}`);
    if (!check || check.error) continue;
    try {
      const look = { lastTitle: check.title ?? f.lastTitle, lastGame: check.game ?? f.lastGame, lastViewers: check.viewers ?? f.lastViewers, lastAvatar: check.avatar ?? f.lastAvatar, lastUrl: check.url ?? f.lastUrl, displayName: f.displayName || check.name || null };
      if (check.live && !f.isLive) {
        const updated = await prisma.streamFriend.update({ where: { id: f.id }, data: { ...look, isLive: true, offlineStrikes: 0, liveStartedAt: check.startedAt ?? new Date() } });
        const config = configs.get(f.guildId);
        if (config?.friendAlerts && config.raidChannelId && (await claimEvent(`friendlive:${f.id}:${Math.floor(Date.now() / 1_800_000)}`).catch(() => true))) {
          const ch = await client.channels.fetch(config.raidChannelId).catch(() => null);
          if (isSendableChannel(ch)) {
            const sent = await ch.send({ embeds: [friendLiveEmbed(updated)], components: [watchRow(urlOf(updated))], allowedMentions: { parse: [] } }).catch(() => null);
            if (sent) await prisma.streamFriend.update({ where: { id: f.id }, data: { alertMessageId: sent.id } });
          }
        }
      } else if (check.live) {
        await prisma.streamFriend.update({ where: { id: f.id }, data: { ...look, offlineStrikes: 0 } });
      } else if (f.isLive) {
        if (f.offlineStrikes + 1 < 2) {
          await prisma.streamFriend.update({ where: { id: f.id }, data: { offlineStrikes: f.offlineStrikes + 1 } });
          continue;
        }
        await prisma.streamFriend.update({ where: { id: f.id }, data: { isLive: false, offlineStrikes: 0, alertMessageId: null } });
        // The "is live" post becomes a quiet "was live".
        const config = configs.get(f.guildId);
        if (f.alertMessageId && config?.raidChannelId) {
          const ch = await client.channels.fetch(config.raidChannelId).catch(() => null);
          const msg = ch && "messages" in ch ? await ch.messages.fetch(f.alertMessageId).catch(() => null) : null;
          const took = f.liveStartedAt ? ` for ${durationText(Date.now() - f.liveStartedAt.getTime())}` : "";
          await msg
            ?.edit({ embeds: [new EmbedBuilder().setColor(0x4b4f58).setDescription(`⚫ **${clean(nameOf(f))}** was live${took}.`)], components: [watchRow(urlOf(f), "Channel")] })
            .catch(() => null);
        }
      } else if (look.lastAvatar !== f.lastAvatar || look.displayName !== f.displayName) {
        await prisma.streamFriend.update({ where: { id: f.id }, data: { lastAvatar: look.lastAvatar, displayName: look.displayName } });
      }
    } catch (err) {
      logError("bot", err, f.guildId);
    }
  }
}

export interface RaidTarget {
  name: string;
  platform: string;
  url: string;
  game: string | null;
  viewers: number | null;
  friend: boolean;
}

// Everyone live right now that you could raid: friends and the server's own
// streamers, smallest audience first.
export async function raidTargets(guildId: string, exceptSubId?: string): Promise<RaidTarget[]> {
  const [friends, subs] = await Promise.all([
    prisma.streamFriend.findMany({ where: { guildId, isLive: true } }),
    prisma.streamSubscription.findMany({ where: { guildId, isLive: true, ...(exceptSubId ? { id: { not: exceptSubId } } : {}) } }),
  ]);
  const out: RaidTarget[] = [
    ...friends.map((f) => ({ name: nameOf(f), platform: f.platform, url: urlOf(f), game: f.lastGame, viewers: f.lastViewers, friend: true })),
    ...subs.map((s: StreamSubscription) => ({ name: s.displayName || s.channelName, platform: s.platform, url: platformInfo(s.platform).url(s.channelName), game: s.lastGame, viewers: null, friend: false })),
  ];
  const seen = new Set<string>();
  return out
    .filter((t) => {
      const k = `${t.platform}:${t.name.toLowerCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => (a.viewers ?? 0) - (b.viewers ?? 0));
}

export function raidListEmbed(targets: RaidTarget[], streamer?: string) {
  const e = new EmbedBuilder().setColor(GOLD).setTitle(streamer ? `🎯 ${clean(streamer)}'s stream is over. Who to raid:` : "🎯 Live right now, ready for a raid");
  if (!targets.length) return e.setDescription("Nobody on the friends list is live right now.");
  e.setDescription(
    targets
      .slice(0, 15)
      .map((t) => `${platformInfo(t.platform).emoji} **[${clean(t.name)}](${t.url})**${t.game ? ` · ${clean(t.game)}` : ""}${typeof t.viewers === "number" ? ` · 👁 ${t.viewers}` : ""}${t.friend ? "" : " · ⭐ member"}`)
      .join("\n"),
  );
  return e.setFooter({ text: "Smallest first: a raid means the most to them." });
}

// When one of your streams ends.
export async function postRaidList(client: Client, sub: StreamSubscription) {
  const config = await prisma.streamGrowthConfig.findUnique({ where: { guildId: sub.guildId } });
  if (!config?.raidListOnEnd || !config.raidChannelId || !sub.discordUserId) return;
  const targets = await raidTargets(sub.guildId, sub.id);
  if (!targets.length) return;
  const ch = await client.channels.fetch(config.raidChannelId).catch(() => null);
  if (!isSendableChannel(ch)) return;
  await ch.send({ content: `<@${sub.discordUserId}>`, embeds: [raidListEmbed(targets, sub.displayName || sub.channelName)], allowedMentions: { users: [sub.discordUserId] } }).catch(() => null);
}

// /so: a shoutout card for a friend, one of the server's streamers, or any
// channel by name on a platform.
export async function shoutoutCard(guildId: string, name: string, platform: LivePlatform | null) {
  const n = name.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?(twitch\.tv|kick\.com|tiktok\.com\/@?|youtube\.com\/@?)\/?/i, "").replace(/[/?#].*$/, "");
  const lower = n.toLowerCase();
  const friend = await prisma.streamFriend.findFirst({
    where: { guildId, ...(platform ? { platform } : {}), OR: [{ handle: { equals: lower, mode: "insensitive" } }, { displayName: { equals: n, mode: "insensitive" } }] },
  });
  const sub = friend
    ? null
    : await prisma.streamSubscription.findFirst({
        where: { guildId, ...(platform ? { platform } : {}), OR: [{ channelName: { equals: lower, mode: "insensitive" } }, { displayName: { equals: n, mode: "insensitive" } }] },
      });
  let plat: string = friend?.platform ?? sub?.platform ?? platform ?? "twitch";
  let handle = friend?.handle ?? sub?.channelName ?? lower;
  let check: LiveCheck | null = null;
  if (plat !== "other") {
    const { checkOne } = await import("../../lib/livePlatforms");
    check = await checkOne(plat as LivePlatform, handle).catch(() => null);
    // Not found on Twitch and no platform given: try Kick.
    if (!friend && !sub && !platform && (!check || check.error)) {
      const k = await checkOne("kick", handle).catch(() => null);
      if (k && !k.error) {
        check = k;
        plat = "kick";
      }
    }
  }
  if (!friend && !sub && (!check || check.error)) return null;
  const p = platformInfo(plat);
  const display = friend?.displayName || sub?.displayName || check?.name || handle;
  const url = check?.url || platformInfo(plat).url(handle);
  const game = check?.game ?? friend?.lastGame ?? sub?.lastGame ?? null;
  const avatar = check?.avatar ?? friend?.lastAvatar ?? sub?.lastAvatar ?? null;
  const e = new EmbedBuilder()
    .setColor(GOLD)
    .setTitle(`📣 Go follow ${clean(display)}!`)
    .setURL(url)
    .setDescription(
      [
        check?.live ? `🔴 **Live now** on ${p.name}${typeof check.viewers === "number" ? ` with ${check.viewers} watching` : ""}` : `${p.emoji} Streams on ${p.name}`,
        check?.live && check.title ? `> ${clean(check.title).slice(0, 200)}` : null,
        game ? `🎮 ${check?.live ? "Playing" : "Last seen playing"} **${clean(game)}**` : null,
        `\n${url}`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .setFooter({ text: "Shoutout from the squad" });
  if (avatar) e.setThumbnail(avatar);
  if (check?.live && check.thumbnail) e.setImage(check.thumbnail);
  handle = handle.replace(/^@/, "");
  return { embed: e, row: watchRow(url, check?.live ? "Watch now" : "Visit channel") };
}
