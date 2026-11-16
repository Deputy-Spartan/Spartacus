import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type ButtonInteraction, type Client, type Message } from "discord.js";
import type { StreamGrowthConfig, StreamSubscription } from "@prisma/client";
import { createHash } from "node:crypto";
import { SG_PREFIX, durationText, findClipLinks, isValidTimezone, minutesText, nextSlotStart, platformInfo } from "@spartacus/shared";
import { logError } from "@spartacus/db";
import { prisma } from "../../lib/prisma";
import { isSendableChannel } from "../../lib/channels";
import { isModuleEnabled } from "../../lib/moduleGate";
import { claimEvent } from "../../lib/eventClaims";
import { drainPending, resetStream, streamMessageCount, topChatters } from "../../lib/chatActivity";
import { accountFor, followerTotal } from "./accounts";
import { postRaidList } from "./friends";
import { voteRow } from "./clips";

const GOLD = 0xffd700;
const clean = (s: string) => s.replace(/[*_`~|]/g, "");

async function enabledConfigs(where: Record<string, unknown>): Promise<StreamGrowthConfig[]> {
  const rows = await prisma.streamGrowthConfig.findMany({ where });
  const out: StreamGrowthConfig[] = [];
  for (const r of rows) if (await isModuleEnabled(r.guildId, "STREAM_GROWTH")) out.push(r);
  return out;
}

export async function growthConfig(guildId: string) {
  if (!(await isModuleEnabled(guildId, "STREAM_GROWTH"))) return null;
  return prisma.streamGrowthConfig.findUnique({ where: { guildId } });
}

// ---- 🔔 Stream Ping role ----

export function pingButton() {
  return new ButtonBuilder().setCustomId(`${SG_PREFIX}ping`).setLabel("Stream pings").setEmoji("🔔").setStyle(ButtonStyle.Secondary);
}

export async function handlePingButton(interaction: ButtonInteraction) {
  const guild = interaction.guild;
  const config = guild ? await growthConfig(guild.id) : null;
  if (!guild || !config?.pingRoleId) {
    await interaction.reply({ content: "Stream pings aren't set up here yet.", ephemeral: true });
    return;
  }
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return;
  const has = member.roles.cache.has(config.pingRoleId);
  const ok = await (has ? member.roles.remove(config.pingRoleId, "Stream pings off") : member.roles.add(config.pingRoleId, "Stream pings on"))
    .then(() => true)
    .catch(() => false);
  await interaction.reply({
    content: !ok ? "⚠️ I couldn't change your roles. Ask staff to check Spartacus's role is above the ping role." : has ? "🔕 You won't get stream pings any more." : "🔔 You'll get a ping before each stream.",
    ephemeral: true,
  });
}

// ---- ⏰ Countdown before each scheduled stream ----

// Every 2 minutes: "live in 1 hour" and "live in 10 minutes" for each slot on
// the Stream Extras schedule.
export async function countdownTick(client: Client) {
  const configs = await enabledConfigs({ countdownEnabled: true, countdownChannelId: { not: null } });
  for (const config of configs) {
    try {
      const extras = await prisma.streamExtrasConfig.findUnique({ where: { guildId: config.guildId } });
      const tz = extras && isValidTimezone(extras.scheduleTimezone) ? extras.scheduleTimezone : "UTC";
      const slots = await prisma.streamSlot.findMany({ where: { guildId: config.guildId } });
      for (const slot of slots) {
        const next = nextSlotStart(tz, slot.dayOfWeek, slot.startMinutes);
        const left = (next.getTime() - Date.now()) / 60_000;
        const kind = config.countdownHour && left > 50 && left <= 64 ? "hour" : config.countdownSoon && left > 0 && left <= 12 ? "soon" : null;
        if (!kind) continue;
        const field = kind === "hour" ? "remindHourFor" : "remindSoonFor";
        // Claimed first, so it's only ever posted once.
        const claimed = await prisma.streamSlot.updateMany({ where: { id: slot.id, OR: [{ [field]: null }, { [field]: { not: next } }] }, data: { [field]: next } });
        if (!claimed.count) continue;
        await sendCountdown(client, config, { streamer: slot.streamer, title: slot.title, link: slot.link, startsAt: next, minutes: Math.max(1, Math.round(left)) });
      }
    } catch (err) {
      logError("bot", err, config.guildId);
    }
  }
}

export async function sendCountdown(client: Client, config: StreamGrowthConfig, s: { streamer: string; title: string | null; link: string | null; startsAt: Date; minutes: number }, test = false) {
  const ch = config.countdownChannelId ? await client.channels.fetch(config.countdownChannelId).catch(() => null) : null;
  if (!isSendableChannel(ch)) return { ok: false, error: "Spartacus can't post in the countdown channel." };
  const at = Math.floor(s.startsAt.getTime() / 1000);
  const embed = new EmbedBuilder()
    .setColor(GOLD)
    .setTitle(`⏰ ${clean(s.streamer)} goes live in ${minutesText(s.minutes)}`)
    .setDescription([s.title ? `**${clean(s.title)}**` : null, `Starts <t:${at}:t> (<t:${at}:R>)`, "\nTap 🔔 to get a ping before every stream."].filter(Boolean).join("\n"));
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (s.link) row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Watch").setURL(s.link));
  if (config.pingRoleId) row.addComponents(pingButton());
  const ping = !test && config.pingRoleId ? `<@&${config.pingRoleId}>` : undefined;
  const sent = await ch
    .send({ content: test ? "🧪 **Test countdown** (no ping)" : ping, embeds: [embed], components: row.components.length ? [row] : [], allowedMentions: { roles: ping && config.pingRoleId ? [config.pingRoleId] : [] } })
    .catch((err) => {
      logError("bot", err, config.guildId);
      return null;
    });
  return sent ? { ok: true } : { ok: false, error: "Discord wouldn't take the post." };
}

// ---- 📺 Who's live board ----

export async function refreshLiveBoards(client: Client, onlyGuild?: string, force = false) {
  const configs = await enabledConfigs({ boardChannelId: { not: null }, ...(onlyGuild ? { guildId: onlyGuild } : {}) });
  for (const config of configs) {
    try {
      await refreshBoard(client, config, force);
    } catch (err) {
      logError("bot", err, config.guildId);
    }
  }
}

async function refreshBoard(client: Client, config: StreamGrowthConfig, force: boolean): Promise<{ ok: boolean; error?: string }> {
  const [subs, friends] = await Promise.all([
    prisma.streamSubscription.findMany({ where: { guildId: config.guildId, isLive: true } }),
    prisma.streamFriend.findMany({ where: { guildId: config.guildId, isLive: true } }),
  ]);
  const line = (emoji: string, name: string, url: string, game: string | null, viewers: number | null, since: Date | null, tag: string) =>
    `${emoji} **[${clean(name)}](${url})**${game ? ` · ${clean(game)}` : ""}${typeof viewers === "number" && viewers > 0 ? ` · 👁 ${viewers}` : ""}${since ? ` · <t:${Math.floor(since.getTime() / 1000)}:R>` : ""}${tag}`;
  const members = subs.map((s) => line(platformInfo(s.platform).emoji, s.displayName || s.channelName, platformInfo(s.platform).url(s.channelName), s.lastGame, s.peakViewers || null, s.liveStartedAt, s.discordUserId ? ` · <@${s.discordUserId}>` : ""));
  const pals = friends.map((f) => line(platformInfo(f.platform).emoji, f.displayName || f.handle, f.lastUrl || platformInfo(f.platform).url(f.handle), f.lastGame, f.lastViewers, f.liveStartedAt, " · 🤝"));
  const hash = createHash("sha1").update(JSON.stringify([members, pals])).digest("hex");
  if (!force && hash === config.boardHash && config.boardMessageId) return { ok: true };
  const embed = new EmbedBuilder()
    .setColor(members.length + pals.length ? 0xe02424 : 0x4b4f58)
    .setTitle(members.length + pals.length ? `📺 Live now (${members.length + pals.length})` : "📺 Live now")
    .setDescription(members.length + pals.length ? [...members, ...pals].slice(0, 30).join("\n").slice(0, 4000) : "Nobody is live right now. This updates by itself when someone goes live.")
    .setFooter({ text: "🤝 = friend of the stream · updates every 2 minutes" })
    .setTimestamp(new Date());
  const ch = await client.channels.fetch(config.boardChannelId as string).catch(() => null);
  if (!isSendableChannel(ch)) return { ok: false, error: "Spartacus can't post in the live board channel." };
  const payload = { embeds: [embed], components: config.pingRoleId ? [new ActionRowBuilder<ButtonBuilder>().addComponents(pingButton())] : [], allowedMentions: { parse: [] as never[] } };
  let msg = config.boardMessageId && "messages" in ch ? await ch.messages.fetch(config.boardMessageId).catch(() => null) : null;
  if (msg) await msg.edit(payload).catch(() => (msg = null));
  if (!msg) msg = await ch.send(payload).catch(() => null);
  if (!msg) return { ok: false, error: "Discord wouldn't take the post." };
  await prisma.streamGrowthConfig.update({ where: { id: config.id }, data: { boardMessageId: msg.id, boardHash: hash } });
  return { ok: true };
}

export async function forceBoard(client: Client, guildId: string) {
  const config = await prisma.streamGrowthConfig.findUnique({ where: { guildId } });
  if (!config?.boardChannelId) return { ok: false, error: "Pick a live board channel first." };
  return refreshBoard(client, config, true);
}

// ---- Stream start and end (called from Going Live) ----

export async function onStreamStart(sub: StreamSubscription) {
  resetStream(sub.platform, sub.channelName);
  const data: { streamFollows: number; startFollowers?: number | null } = { streamFollows: 0 };
  if (await isModuleEnabled(sub.guildId, "STREAM_GROWTH")) {
    const account = await accountFor(sub.guildId, sub.platform, sub.channelName).catch(() => null);
    if (account) data.startFollowers = await followerTotal(account).catch(() => null);
  }
  await prisma.streamSubscription.update({ where: { id: sub.id }, data }).catch(() => null);
}

export async function onStreamEnd(client: Client, sub: StreamSubscription) {
  const config = await growthConfig(sub.guildId);
  if (!config) return;
  if (!(await claimEvent(`streamend:${sub.id}:${sub.liveStartedAt?.getTime() ?? 0}`).catch(() => true))) return;
  await postRaidList(client, sub).catch((e) => logError("bot", e, sub.guildId));
  if (config.recapEnabled && config.recapChannelId && (!config.recapLinkedOnly || sub.discordUserId)) await postRecap(client, config, sub).catch((e) => logError("bot", e, sub.guildId));
  await refreshLiveBoards(client, sub.guildId).catch(() => null);
}

async function postRecap(client: Client, config: StreamGrowthConfig, sub: StreamSubscription) {
  const ch = await client.channels.fetch(config.recapChannelId as string).catch(() => null);
  if (!isSendableChannel(ch)) return;
  const start = sub.liveStartedAt ?? new Date();
  const lengthMs = Date.now() - start.getTime();
  if (lengthMs < 10 * 60_000) return; // a test or a false start
  const p = platformInfo(sub.platform);
  const name = sub.displayName || sub.channelName;
  // New followers: Twitch from the follower total, Kick from its follow webhooks.
  let followers: number | null = null;
  const account = await accountFor(sub.guildId, sub.platform, sub.channelName).catch(() => null);
  if (account?.platform === "twitch" && typeof sub.startFollowers === "number") {
    const now = await followerTotal(account);
    if (typeof now === "number") followers = Math.max(0, now - sub.startFollowers);
  } else if (account?.platform === "kick") followers = sub.streamFollows;
  const chatters = topChatters(sub.platform, sub.channelName, 3);
  const messages = streamMessageCount(sub.platform, sub.channelName);
  const clip = await prisma.streamClip.findFirst({
    where: { guildId: sub.guildId, clippedAt: { gte: start }, OR: [{ streamer: { equals: name, mode: "insensitive" } }, { streamer: { equals: sub.channelName, mode: "insensitive" } }] },
    orderBy: [{ votes: "desc" }, { views: "desc" }],
  });
  const clipCount = await prisma.streamClip.count({ where: { guildId: sub.guildId, clippedAt: { gte: start }, OR: [{ streamer: { equals: name, mode: "insensitive" } }, { streamer: { equals: sub.channelName, mode: "insensitive" } }] } });
  const medals = ["🥇", "🥈", "🥉"];
  const embed = new EmbedBuilder()
    .setColor(GOLD)
    .setAuthor({ name: `${p.emoji} ${name} on ${p.name}`, iconURL: sub.lastAvatar || undefined, url: p.url(sub.channelName) })
    .setTitle("📊 Stream recap")
    .setDescription(sub.lastTitle ? `**${clean(sub.lastTitle).slice(0, 200)}**` : null)
    .addFields(
      { name: "⏱️ Streamed", value: durationText(lengthMs), inline: true },
      { name: "👁 Peak viewers", value: sub.peakViewers ? String(sub.peakViewers) : "—", inline: true },
      { name: "➕ New followers", value: followers === null ? "—" : String(followers), inline: true },
    )
    .setFooter({ text: "Thanks to everyone who came by!" })
    .setTimestamp(new Date());
  if (sub.lastGame) embed.addFields({ name: "🎮 Played", value: clean(sub.lastGame).slice(0, 100), inline: true });
  if (messages) embed.addFields({ name: "💬 Chat messages", value: String(messages), inline: true });
  if (clipCount) embed.addFields({ name: "🎬 Clips", value: String(clipCount), inline: true });
  if (chatters.length) embed.addFields({ name: "🗣️ Top chatters", value: chatters.map((c, i) => `${medals[i]} **${clean(c.user)}** (${c.messages})`).join("\n") });
  if (clip) embed.addFields({ name: "🔥 Best clip", value: `[${clean(clip.title).slice(0, 80)}](${clip.url})${clip.votes ? ` · ${clip.votes} vote${clip.votes === 1 ? "" : "s"}` : ""}` });
  if (sub.lastThumbnail) embed.setImage(sub.lastThumbnail);
  await ch.send({ embeds: [embed], allowedMentions: { parse: [] } });
}

// ---- ⭐ Viewer of the Week ----

// Discord messages count while one of the server's own streamers is live.
const liveGuilds = new Set<string>();
const discordPending = new Map<string, Map<string, number>>(); // guild -> user -> messages

export async function refreshLiveGuilds() {
  const configs = await enabledConfigs({ votwEnabled: true });
  liveGuilds.clear();
  if (!configs.length) return;
  const live = await prisma.streamSubscription.findMany({ where: { guildId: { in: configs.map((c) => c.guildId) }, isLive: true, discordUserId: { not: null } }, select: { guildId: true } });
  for (const l of live) liveGuilds.add(l.guildId);
}

export function countDiscordMessage(message: Message) {
  if (!message.guildId || message.author.bot || !liveGuilds.has(message.guildId)) return;
  let m = discordPending.get(message.guildId);
  if (!m) discordPending.set(message.guildId, (m = new Map()));
  m.set(message.author.id, (m.get(message.author.id) ?? 0) + 1);
}

// Every 5 minutes: what was said in stream chats (by linked viewers) and in
// Discord goes into today's count.
export async function flushViewerCounts() {
  const day = new Date().toISOString().slice(0, 10);
  const add = new Map<string, number>(); // guild|user -> messages
  for (const [guildId, users] of discordPending) for (const [userId, n] of users) add.set(`${guildId}|${userId}`, (add.get(`${guildId}|${userId}`) ?? 0) + n);
  discordPending.clear();
  const chat = drainPending();
  if (chat.length) {
    const configs = await enabledConfigs({ votwEnabled: true });
    if (configs.length) {
      const guildIds = configs.map((c) => c.guildId);
      const channels = [...new Set(chat.map((c) => `${c.platform}:${c.channel}`))];
      const subs = await prisma.streamSubscription.findMany({
        where: { guildId: { in: guildIds }, OR: channels.map((k) => ({ platform: k.split(":")[0], channelName: { equals: k.slice(k.indexOf(":") + 1), mode: "insensitive" as const } })) },
        select: { guildId: true, platform: true, channelName: true },
      });
      const links = await prisma.streamLink.findMany({ where: { guildId: { in: guildIds }, verified: true, handle: { in: [...new Set(chat.map((c) => c.user))] } } });
      for (const c of chat) {
        for (const s of subs) {
          if (s.platform !== c.platform || s.channelName.toLowerCase() !== c.channel) continue;
          const link = links.find((l) => l.guildId === s.guildId && l.platform === c.platform && l.handle === c.user);
          if (link) add.set(`${s.guildId}|${link.userId}`, (add.get(`${s.guildId}|${link.userId}`) ?? 0) + c.messages);
        }
      }
    }
  }
  for (const [k, n] of add) {
    const [guildId, userId] = k.split("|");
    await prisma.streamViewerDay
      .upsert({ where: { guildId_userId_day: { guildId, userId, day } }, create: { guildId, userId, day, messages: n }, update: { messages: { increment: n } } })
      .catch(() => null);
  }
}

// The top viewers of the last 7 days (never the server's own streamers).
export async function topViewers(guildId: string, n = 3) {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const streamers = new Set((await prisma.streamSubscription.findMany({ where: { guildId, discordUserId: { not: null } }, select: { discordUserId: true } })).map((s) => s.discordUserId as string));
  const rows = await prisma.streamViewerDay.groupBy({ by: ["userId"], where: { guildId, day: { gte: since } }, _sum: { messages: true }, orderBy: { _sum: { messages: "desc" } }, take: n + streamers.size });
  return rows.filter((r) => !streamers.has(r.userId) && (r._sum.messages ?? 0) > 0).slice(0, n).map((r) => ({ userId: r.userId, messages: r._sum.messages ?? 0 }));
}

// Checked every 5 minutes; picks once on the chosen day, at 18:00 UTC or later.
export async function votwTick(client: Client) {
  const now = new Date();
  const configs = await enabledConfigs({ votwEnabled: true });
  for (const config of configs) {
    if (now.getUTCDay() !== config.votwDay || now.getUTCHours() < 18) continue;
    const label = now.toISOString().slice(0, 10);
    if (config.votwLastWeek === label) continue;
    const claimed = await prisma.streamGrowthConfig.updateMany({ where: { id: config.id, OR: [{ votwLastWeek: null }, { votwLastWeek: { not: label } }] }, data: { votwLastWeek: label } });
    if (!claimed.count) continue;
    await pickViewerOfTheWeek(client, config).catch((e) => logError("bot", e, config.guildId));
  }
  if (Math.random() < 0.01) await prisma.streamViewerDay.deleteMany({ where: { day: { lt: new Date(Date.now() - 15 * 86_400_000).toISOString().slice(0, 10) } } }).catch(() => null);
}

export async function pickViewerOfTheWeek(client: Client, config: StreamGrowthConfig, test = false): Promise<{ ok: boolean; error?: string }> {
  const guild = client.guilds.cache.get(config.guildId);
  if (!guild) return { ok: false, error: "Spartacus isn't in that server." };
  const top = await topViewers(config.guildId, 3);
  if (!top.length) return { ok: false, error: "Nobody has chatted during a stream in the last 7 days yet." };
  const winner = top[0];
  if (config.votwRoleId && !test) {
    const role = await guild.roles.fetch(config.votwRoleId).catch(() => null);
    if (role) {
      for (const m of role.members.values()) if (m.id !== winner.userId) await m.roles.remove(role, "Viewer of the Week: new week").catch(() => null);
      const m = await guild.members.fetch(winner.userId).catch(() => null);
      await m?.roles.add(role, "Viewer of the Week").catch(() => null);
    }
  }
  const ch = config.votwChannelId ? await client.channels.fetch(config.votwChannelId).catch(() => null) : null;
  if (!isSendableChannel(ch)) return { ok: false, error: "Pick a Viewer of the Week channel first." };
  const member = await guild.members.fetch(winner.userId).catch(() => null);
  const embed = new EmbedBuilder()
    .setColor(GOLD)
    .setTitle("⭐ Viewer of the Week")
    .setDescription(
      [
        `<@${winner.userId}> was the most active viewer this week with **${winner.messages.toLocaleString("en-US")}** messages in stream chat and in Discord during streams.`,
        config.votwRoleId ? `They wear <@&${config.votwRoleId}> for the next 7 days.` : null,
        top.length > 1 ? `\nRunners-up: ${top.slice(1).map((t) => `<@${t.userId}> (${t.messages})`).join(", ")}` : null,
        "\n-# Link your Twitch or Kick with /link so your stream chat counts too.",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  if (member) embed.setThumbnail(member.displayAvatarURL({ size: 256 }));
  const sent = await ch.send({ content: test ? "🧪 **Test pick** (no role given, no ping)" : `<@${winner.userId}>`, embeds: [embed], allowedMentions: { users: test ? [] : [winner.userId] } }).catch(() => null);
  return sent ? { ok: true } : { ok: false, error: "Discord wouldn't take the post." };
}

// ---- 🎬 Clip links posted by viewers get a vote button ----

// Which channel takes clip links in each server, kept in memory so ordinary
// messages never touch the database. Refreshed every 5 minutes and on save.
const clipChannels = new Map<string, string>();
export async function refreshClipChannels() {
  const rows = await prisma.streamGrowthConfig.findMany({ where: { clipSubmitChannelId: { not: null } }, select: { guildId: true, clipSubmitChannelId: true } });
  clipChannels.clear();
  for (const r of rows) if (r.clipSubmitChannelId) clipChannels.set(r.guildId, r.clipSubmitChannelId);
}

export async function handleClipSubmission(message: Message) {
  if (!message.guildId || message.author.bot || clipChannels.get(message.guildId) !== message.channelId) return;
  if (!message.content.includes("http")) return;
  const links = findClipLinks(message.content).slice(0, 3);
  if (!links.length || !(await isModuleEnabled(message.guildId, "STREAM_GROWTH"))) return;
  for (const link of links) {
    const exists = await prisma.streamClip.findUnique({ where: { guildId_platform_clipId: { guildId: message.guildId, platform: link.platform, clipId: link.clipId } } });
    if (exists) continue;
    const who = message.member?.displayName ?? message.author.username;
    const row = await prisma.streamClip
      .create({
        data: {
          guildId: message.guildId,
          platform: link.platform,
          clipId: link.clipId,
          url: link.url,
          title: `${link.streamer ?? "Stream"} clip from ${who}`.slice(0, 200),
          creator: who,
          streamer: link.streamer,
          clippedAt: new Date(),
          channelId: message.channelId,
        },
      })
      .catch(() => null);
    if (!row) continue;
    const sent = await message.reply({ content: `🎬 ${platformInfo(link.platform).emoji} Vote for this clip. The most-voted clip of the week gets its own post.`, components: [voteRow(row.id, 0)], allowedMentions: { repliedUser: false } }).catch(() => null);
    if (sent) await prisma.streamClip.update({ where: { id: row.id }, data: { messageId: sent.id } });
  }
}
