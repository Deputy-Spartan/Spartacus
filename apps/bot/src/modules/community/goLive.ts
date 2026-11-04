import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, type BaseMessageOptions, type Guild } from "discord.js";
import type { StreamAlertSettings, StreamSubscription } from "@prisma/client";
import { buildGoLiveMessage, fillGoLiveExtra, platformInfo, type LiveInfo, type LivePlatform } from "@spartacus/shared";
import { prisma } from "../../lib/prisma";
import { logError } from "@spartacus/db";
import { isSendableChannel } from "../../lib/channels";
import { isModuleEnabled } from "../../lib/moduleGate";
import { checkKick, checkTikTok, checkTwitchMany, checkYouTube, type LiveCheck } from "../../lib/livePlatforms";

// The platform checks, in one place so tests can stand in for them.
export const checkers = { twitch: checkTwitchMany, youtube: checkYouTube, kick: checkKick, tiktok: checkTikTok };
import { claimEvent } from "../../lib/eventClaims";

type Sub = StreamSubscription;

async function settingsFor(guildId: string): Promise<Partial<StreamAlertSettings>> {
  return (await prisma.streamAlertSettings.findUnique({ where: { guildId } })) ?? {};
}

function infoOf(sub: Sub, check?: LiveCheck | null, settings?: Partial<StreamAlertSettings>): LiveInfo {
  const plat = platformInfo(sub.platform);
  return {
    name: sub.displayName || check?.name || sub.channelName.replace(/^@/, ""),
    platform: sub.platform as LivePlatform,
    platformName: sub.platformName ?? undefined,
    title: check?.title ?? sub.lastTitle,
    game: check?.game ?? sub.lastGame,
    viewers: check?.viewers ?? null,
    url: check?.url || plat.url(sub.channelName),
    thumbnail: check?.thumbnail ?? sub.lastThumbnail,
    avatar: check?.avatar ?? sub.lastAvatar,
    userId: sub.discordUserId,
    roleId: sub.pingRoleId || settings?.pingRoleId || null,
    startedAt: sub.liveStartedAt,
  };
}

export function discordPayload(settings: Partial<StreamAlertSettings>, info: LiveInfo, ended?: { peak: number; durationMs: number }): BaseMessageOptions {
  const m = buildGoLiveMessage(settings, info, ended);
  const embed = new EmbedBuilder().setColor(m.color as `#${string}`).setTitle(m.title).setURL(m.button.url).setFooter({ text: m.footer }).setTimestamp(new Date());
  if (m.description) embed.setDescription(m.description);
  embed.setAuthor({ name: m.author.name.slice(0, 256), iconURL: m.author.icon || undefined, url: m.button.url });
  if (m.fields.length) embed.addFields(m.fields);
  if (m.image) embed.setImage(m.image);
  if (m.thumbnail) embed.setThumbnail(m.thumbnail);
  // Extras from the dashboard replace the matching default part.
  if (!ended) {
    const x = fillGoLiveExtra(settings.embedExtra, info);
    if (x.authorName) embed.setAuthor({ name: x.authorName.slice(0, 256), iconURL: x.authorIconUrl || m.author.icon || undefined, url: m.button.url });
    if (x.thumbnailUrl) embed.setThumbnail(x.thumbnailUrl);
    if (x.imageUrl) embed.setImage(x.imageUrl);
    if (x.footerText || x.footerIconUrl) embed.setFooter({ text: x.footerText || m.footer, iconURL: x.footerIconUrl || undefined });
    if (x.fields?.length) embed.addFields(x.fields.slice(0, 25 - m.fields.length));
  }
  const button = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(m.button.label || "Watch").setURL(m.button.url);
  if (m.button.emoji) button.setEmoji(m.button.emoji);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
  return {
    content: m.content || undefined,
    embeds: [embed],
    components: [row],
    allowedMentions: { roles: info.roleId && !ended ? [info.roleId] : [], users: [] },
  };
}

async function setLiveRole(guild: Guild, sub: Sub, settings: Partial<StreamAlertSettings>, on: boolean) {
  if (!settings.liveRoleId || !sub.discordUserId) return;
  const member = await guild.members.fetch(sub.discordUserId).catch(() => null);
  if (!member) return;
  if (on) await member.roles.add(settings.liveRoleId, "Going Live: started streaming").catch(() => null);
  else {
    // Keep the role if another of their streams is still live.
    const stillLive = await prisma.streamSubscription.count({ where: { guildId: sub.guildId, discordUserId: sub.discordUserId, isLive: true, id: { not: sub.id } } });
    if (!stillLive) await member.roles.remove(settings.liveRoleId, "Going Live: stream ended").catch(() => null);
  }
}

export async function announce(client: Client, sub: Sub, check: LiveCheck | null): Promise<{ ok: boolean; error?: string }> {
  const settings = await settingsFor(sub.guildId);
  const guild = client.guilds.cache.get(sub.guildId);
  const channel = await client.channels.fetch(sub.announceChannelId || settings.defaultChannelId || "").catch(() => null);
  if (!guild || !isSendableChannel(channel)) return { ok: false, error: "Spartacus can't post in the alert channel." };
  const cooldown = (settings.cooldownMinutes ?? 30) * 60_000;
  const recent = sub.lastNotifiedAt && Date.now() - sub.lastNotifiedAt.getTime() < cooldown && sub.liveMessageId;
  const now = new Date();
  const data = {
    isLive: true,
    offlineStrikes: 0,
    lastError: null,
    liveStartedAt: check?.startedAt ?? now,
    lastTitle: check?.title ?? sub.lastTitle,
    lastGame: check?.game ?? sub.lastGame,
    lastThumbnail: check?.thumbnail ?? sub.lastThumbnail,
    lastAvatar: check?.avatar ?? sub.lastAvatar,
    peakViewers: Math.max(0, check?.viewers ?? 0),
  };
  const info = infoOf({ ...sub, ...data }, check, settings);
  // Back within the cooldown (a dropped connection): reuse the last post.
  if (recent) {
    const old = await channel.messages.fetch(sub.liveMessageId!).catch(() => null);
    if (old) {
      await old.edit(discordPayload(settings, info)).catch(() => null);
      await prisma.streamSubscription.update({ where: { id: sub.id }, data: { ...data, liveStartedAt: sub.liveStartedAt ?? data.liveStartedAt } });
      await setLiveRole(guild, sub, settings, true);
      return { ok: true };
    }
  }
  // During a deploy two copies of the bot run for a moment; only one posts.
  if (!(await claimEvent(`golive:${sub.id}:${Math.floor(now.getTime() / 600_000)}`).catch(() => true))) return { ok: true };
  const posted = await channel.send(discordPayload(settings, info)).catch((err) => {
    logError("bot", err, sub.guildId);
    return null;
  });
  await prisma.streamSubscription.update({ where: { id: sub.id }, data: { ...data, liveMessageId: posted?.id ?? null, lastNotifiedAt: now } });
  await setLiveRole(guild, sub, settings, true);
  return posted ? { ok: true } : { ok: false, error: "Discord wouldn't take the post." };
}

async function refresh(client: Client, sub: Sub, check: LiveCheck) {
  const peak = Math.max(sub.peakViewers, check.viewers ?? 0);
  await prisma.streamSubscription.update({
    where: { id: sub.id },
    data: { offlineStrikes: 0, lastError: null, peakViewers: peak, lastTitle: check.title ?? sub.lastTitle, lastGame: check.game ?? sub.lastGame, lastThumbnail: check.thumbnail ?? sub.lastThumbnail },
  });
  const settings = await settingsFor(sub.guildId);
  if (settings.updateWhileLive === false || !sub.liveMessageId) return;
  const channel = await client.channels.fetch(sub.announceChannelId).catch(() => null);
  if (!isSendableChannel(channel)) return;
  const msg = await channel.messages.fetch(sub.liveMessageId).catch(() => null);
  if (msg) await msg.edit({ ...discordPayload(settings, infoOf(sub, check, settings)), content: undefined }).catch(() => null);
}

export async function endStream(client: Client, sub: Sub) {
  const settings = await settingsFor(sub.guildId);
  const guild = client.guilds.cache.get(sub.guildId);
  await prisma.streamSubscription.update({ where: { id: sub.id }, data: { isLive: false, offlineStrikes: 0 } });
  if (guild) await setLiveRole(guild, sub, settings, false);
  if (!sub.liveMessageId) return;
  const channel = await client.channels.fetch(sub.announceChannelId).catch(() => null);
  if (!isSendableChannel(channel)) return;
  const msg = await channel.messages.fetch(sub.liveMessageId).catch(() => null);
  if (!msg) return;
  const action = settings.endAction ?? "EDIT";
  if (action === "DELETE") await msg.delete().catch(() => null);
  else if (action === "EDIT") {
    const durationMs = Date.now() - (sub.liveStartedAt?.getTime() ?? Date.now());
    await msg.edit({ ...discordPayload(settings, infoOf(sub, null, settings), { peak: sub.peakViewers, durationMs }), content: "" }).catch(() => null);
  }
}

// Called every 2 minutes for every auto-checked streamer.
export async function pollStreams(client: Client) {
  const subs = await prisma.streamSubscription.findMany({ where: { platform: { in: ["twitch", "youtube", "kick", "tiktok"] } }, take: 500 });
  const enabled = new Map<string, boolean>();
  const active: Sub[] = [];
  for (const s of subs) {
    if (!enabled.has(s.guildId)) enabled.set(s.guildId, await isModuleEnabled(s.guildId, "STREAM_ALERTS"));
    if (enabled.get(s.guildId)) active.push(s);
  }
  const twitch = await checkers.twitch([...new Set(active.filter((s) => s.platform === "twitch").map((s) => s.channelName.toLowerCase()))]).catch(() => new Map<string, LiveCheck>());
  // The page-based checks, a few at a time, each handle once even if several servers follow it.
  const others = new Map<string, LiveCheck>();
  const keys = [...new Set(active.filter((s) => s.platform !== "twitch").map((s) => `${s.platform}:${s.channelName}`))];
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
  for (const sub of active) {
    const check = sub.platform === "twitch" ? twitch.get(sub.channelName.toLowerCase()) : others.get(`${sub.platform}:${sub.channelName}`);
    if (!check) continue;
    try {
      if (check.error) {
        // Don't end a stream because a site had a bad moment; just note it.
        if (check.error !== sub.lastError) await prisma.streamSubscription.update({ where: { id: sub.id }, data: { lastError: check.error } });
        continue;
      }
      if (check.live && !sub.isLive) await announce(client, sub, check);
      else if (check.live) await refresh(client, sub, check);
      else if (sub.isLive) {
        // Two offline checks in a row before calling it over.
        if (sub.offlineStrikes + 1 >= 2) await endStream(client, sub);
        else await prisma.streamSubscription.update({ where: { id: sub.id }, data: { offlineStrikes: sub.offlineStrikes + 1 } });
      } else if (sub.lastError || (check.avatar && check.avatar !== sub.lastAvatar)) {
        await prisma.streamSubscription.update({ where: { id: sub.id }, data: { lastError: null, lastAvatar: check.avatar ?? sub.lastAvatar } });
      }
    } catch (err) {
      logError("bot", err, sub.guildId);
    }
  }
}

// /golive: announce a stream by hand, for any platform.
export async function manualGoLive(client: Client, guildId: string, userId: string, displayName: string, platform: LivePlatform, link: string, title: string | null, platformName?: string | null) {
  const settings = await settingsFor(guildId);
  const channelId = settings.defaultChannelId;
  if (!channelId) return { ok: false, error: "Pick an alert channel on the dashboard's Going Live page first." };
  const handle = platform === "other" ? link : link;
  let sub = await prisma.streamSubscription.findFirst({ where: { guildId, discordUserId: userId, platform, channelName: handle } });
  sub ??= await prisma.streamSubscription.create({ data: { guildId, platform, channelName: handle, announceChannelId: channelId, discordUserId: userId, displayName, platformName: platformName ?? null } });
  if (platformName && sub.platformName !== platformName) sub = await prisma.streamSubscription.update({ where: { id: sub.id }, data: { platformName } });
  const check: LiveCheck = { live: true, title, url: platform === "other" ? link : null };
  return announce(client, { ...sub, lastNotifiedAt: null }, check);
}

export async function manualEndLive(client: Client, guildId: string, userId: string) {
  const live = await prisma.streamSubscription.findMany({ where: { guildId, discordUserId: userId, isLive: true } });
  for (const s of live) await endStream(client, s);
  return live.length;
}

// Dashboard: check one streamer now, and optionally post a test.
export async function checkStreamerNow(client: Client, id: string) {
  const sub = await prisma.streamSubscription.findUnique({ where: { id } });
  if (!sub) return { error: "Not found." };
  const r =
    sub.platform === "twitch"
      ? (await checkers.twitch([sub.channelName])).get(sub.channelName)
      : sub.platform === "youtube"
        ? await checkers.youtube(sub.channelName)
        : sub.platform === "kick"
          ? await checkers.kick(sub.channelName)
          : sub.platform === "tiktok"
            ? await checkers.tiktok(sub.channelName)
            : { live: sub.isLive };
  await prisma.streamSubscription.update({ where: { id }, data: { lastError: r?.error ?? null, lastAvatar: r?.avatar ?? sub.lastAvatar } }).catch(() => null);
  return r ?? { error: "No answer." };
}

export async function sendTestAlert(client: Client, id: string) {
  const sub = await prisma.streamSubscription.findUnique({ where: { id } });
  if (!sub) return { ok: false, error: "Not found." };
  const settings = await settingsFor(sub.guildId);
  const channel = await client.channels.fetch(sub.announceChannelId || settings.defaultChannelId || "").catch(() => null);
  if (!isSendableChannel(channel)) return { ok: false, error: "Spartacus can't post in the alert channel." };
  const info = infoOf(sub, { live: true, title: sub.lastTitle || "Test stream: ranked grind", game: sub.lastGame || "Rainbow Six Siege", viewers: 42 }, settings);
  const payload = discordPayload(settings, info);
  // A test never pings anyone.
  const sent = await channel.send({ ...payload, content: `🧪 **Test alert** (no ping)\n${payload.content ?? ""}`.trim(), allowedMentions: { parse: [] } }).catch(() => null);
  return sent ? { ok: true } : { ok: false, error: "Discord wouldn't take the post." };
}
