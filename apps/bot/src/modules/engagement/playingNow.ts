import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Guild,
  type MessageActionRowComponentBuilder,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import type { PlayingNowConfig, PlayingNowPost } from "@prisma/client";
import { cleanPlayingNowModes } from "@spartacus/shared";
import { logError } from "@spartacus/db";
import { prisma } from "../../lib/prisma";
import { isSendableChannel } from "../../lib/channels";
import { isModuleEnabled } from "../../lib/moduleGate";
import { withLock } from "../matches/lock";

// Playing Now: members tap "I'm on now", pick a mode, how many players they
// need and for how long. They get the Playing Now role (shown in its own
// group in the member list) and a post others can join. When time's up, they
// tap I'm done, or they leave voice for a while, it all clears itself.

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;
const GREEN = 0x3ba55d;
const GREY = 0x4e5058;
const AWAY_MS = 10 * 60_000; // out of voice this long ends the post
const CLEANUP_MS = 15 * 60_000; // ended posts are deleted after this
const JOIN_PING_MS = 2 * 60_000;
const MATCHMAKING_AT = 5; // people on before the Matchmaking button shows
const row = (...items: MessageActionRowComponentBuilder[]) => new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...items);
const lock = (guildId: string) => <T>(run: () => Promise<T>) => withLock(`pn:${guildId}`, run);
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const at = (d: Date) => `<t:${Math.floor(d.getTime() / 1000)}:R>`;
const pending = new Map<string, { mode: string; need: number; mins: number }>();

const config = (guildId: string) => prisma.playingNowConfig.findUnique({ where: { guildId } });
const activePosts = (guildId: string) => prisma.playingNowPost.findMany({ where: { guildId, endedAt: null }, orderBy: { createdAt: "asc" } });

// ---- The panel ----

async function panelMessage(guildId: string, cfg: PlayingNowConfig) {
  const posts = await activePosts(guildId);
  const players = new Set(posts.flatMap((p) => [p.userId, ...ids(p.joined)]));
  const embed = new EmbedBuilder()
    .setColor(GREEN)
    .setTitle("🎮 Playing Now")
    .setDescription(
      [
        "On right now and want people to play with? Tap **I'm on now**.",
        `You get ${cfg.roleId ? `<@&${cfg.roleId}>` : "the Playing Now role"} for a while and a post here others can join. It all clears itself when you're done.`,
        cfg.notifyRoleId ? `Want a ping when someone's on? Tap **Notify me** (at most one ping every ${cfg.pingCooldown} min).` : "",
        "",
        posts.length ? `**${players.size}** playing right now` : "Nobody's on right now. Be the first!",
      ]
        .filter((l, i) => l || i === 3)
        .join("\n")
    );
  const buttons: MessageActionRowComponentBuilder[] = [new ButtonBuilder().setCustomId("pn:on").setLabel("I'm on now").setEmoji("🎮").setStyle(ButtonStyle.Success)];
  if (cfg.notifyRoleId) buttons.push(new ButtonBuilder().setCustomId("pn:notify").setLabel("Notify me").setEmoji("🔔").setStyle(ButtonStyle.Secondary));
  if (cfg.matchmakingButton && players.size >= MATCHMAKING_AT) {
    const mm = await prisma.matchmakingConfig.findUnique({ where: { guildId }, select: { channelId: true, enabled: true } });
    if (mm?.enabled && mm.channelId) buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Queue in Matchmaking").setEmoji("⚔️").setURL(`https://discord.com/channels/${guildId}/${mm.channelId}`));
  }
  return { embeds: [embed], components: [row(...buttons)] };
}

// Edits the panel, or posts it (at the bottom of the channel when `bottom`).
export async function syncPlayingNowPanel(client: Client, guildId: string, bottom = false): Promise<string | null> {
  const cfg = await config(guildId);
  if (!cfg?.channelId) return null;
  if (!(await isModuleEnabled(guildId, "PLAYING_NOW"))) return "Turn on the Playing Now module first.";
  const channel = await client.channels.fetch(cfg.channelId).catch(() => null);
  if (!isSendableChannel(channel)) return "Spartacus can't post in that channel. Check it can see the channel and send messages there.";
  const body = await panelMessage(guildId, cfg);
  const old = cfg.panelMessageId ? await channel.messages.fetch(cfg.panelMessageId).catch(() => null) : null;
  if (old && !bottom && (await old.edit(body).catch(() => null))) return null;
  const sent = await channel.send(body).catch((err) => {
    logError("bot", err, guildId);
    return null;
  });
  if (!sent) return "Discord refused the panel. Check Spartacus can send messages and embeds there.";
  await prisma.playingNowConfig.update({ where: { guildId }, data: { panelMessageId: sent.id } });
  await old?.delete().catch(() => null);
  return null;
}

// ---- A post ----

function postMessage(post: PlayingNowPost, name: string, avatar: string | null) {
  const joined = ids(post.joined);
  const ended = !!post.endedAt;
  const full = joined.length >= post.need;
  const slots = Array.from({ length: post.need }, (_, i) => (i < joined.length ? "👤" : "➕")).join(" ");
  const status = ended ? "⏹️ No longer looking" : full ? `✅ Squad full, good luck! · ends ${at(post.endsAt)}` : `Needs **${post.need - joined.length}** more · ends ${at(post.endsAt)}`;
  const embed = new EmbedBuilder()
    .setColor(ended ? GREY : full ? GREEN : 0x5865f2)
    .setAuthor({ name, iconURL: avatar ?? undefined })
    .setTitle(`🎮 ${name} is on: ${post.mode}`.slice(0, 256))
    .setDescription([post.note ? `> ${post.note}` : "", `${slots}`, status, joined.length ? `With: ${joined.map((id) => `<@${id}>`).join(" ")}` : ""].filter(Boolean).join("\n"));
  if (ended) return { embeds: [embed], components: [] };
  const buttons: MessageActionRowComponentBuilder[] = [];
  if (!full) buttons.push(new ButtonBuilder().setCustomId(`pn:join:${post.id}`).setLabel("Join").setEmoji("🙋").setStyle(ButtonStyle.Primary));
  if (post.voiceId) buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Their voice").setEmoji("🔊").setURL(`https://discord.com/channels/${post.guildId}/${post.voiceId}`));
  buttons.push(new ButtonBuilder().setCustomId(`pn:more:${post.id}`).setLabel("+30 min").setEmoji("⏱️").setStyle(ButtonStyle.Secondary));
  buttons.push(new ButtonBuilder().setCustomId(`pn:done:${post.id}`).setLabel("I'm done").setEmoji("⏹️").setStyle(ButtonStyle.Secondary));
  return { embeds: [embed], components: [row(...buttons)] };
}

async function refreshPost(client: Client, post: PlayingNowPost) {
  const cfg = await config(post.guildId);
  if (!cfg?.channelId || !post.messageId) return;
  const channel = await client.channels.fetch(cfg.channelId).catch(() => null);
  if (!isSendableChannel(channel)) return;
  const guild = await client.guilds.fetch(post.guildId).catch(() => null);
  const member = await guild?.members.fetch(post.userId).catch(() => null);
  const message = await channel.messages.fetch(post.messageId).catch(() => null);
  await message?.edit(postMessage(post, member?.displayName ?? "Someone", member?.displayAvatarURL() ?? null)).catch(() => null);
}

async function setRole(guild: Guild | null, userId: string, roleId: string | null, on: boolean) {
  if (!guild || !roleId) return;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;
  if (on) await member.roles.add(roleId, "Playing Now").catch((err) => logError("bot", err, guild.id));
  else await member.roles.remove(roleId, "Playing Now ended").catch(() => null);
}

async function endPost(client: Client, post: PlayingNowPost) {
  const ended = await prisma.playingNowPost.update({ where: { id: post.id }, data: { endedAt: new Date() } });
  await refreshPost(client, ended);
  const cfg = await config(post.guildId);
  const stillOn = await prisma.playingNowPost.count({ where: { guildId: post.guildId, userId: post.userId, endedAt: null } });
  if (!stillOn) await setRole(await client.guilds.fetch(post.guildId).catch(() => null), post.userId, cfg?.roleId ?? null, false);
  await syncPlayingNowPanel(client, post.guildId);
}

// ---- Interactions (pn:..., pnset:..., pnnote) ----

function setupScreen(cfg: PlayingNowConfig, choice: { mode: string; need: number; mins: number }) {
  const modes = cleanPlayingNowModes(cfg.modes);
  const durations = [30, 60, 120].filter((m) => m <= cfg.maxMinutes);
  const menu = (id: string, placeholder: string, options: Array<[string, string]>, current: string) =>
    row(new StringSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder).addOptions(options.map(([value, label]) => ({ value, label, default: value === current }))));
  return {
    content: "🎮 **What are you playing?** Pick below, then tap **Post it**.",
    components: [
      menu("pnset:mode", "Mode", modes.map((m) => [m, m]), choice.mode),
      menu("pnset:need", "Players needed", [1, 2, 3, 4, 5].map((n) => [String(n), `Need ${n} more`]), String(choice.need)),
      menu("pnset:mins", "For how long", durations.map((m) => [String(m), m === 120 ? "2 hours" : m === 60 ? "1 hour" : `${m} minutes`]), String(choice.mins)),
      row(
        new ButtonBuilder().setCustomId("pn:post").setLabel("Post it").setEmoji("🎮").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("pn:note").setLabel("Add a note & post").setEmoji("📝").setStyle(ButtonStyle.Secondary)
      ),
    ] as Row[],
  };
}

function choiceFor(cfg: PlayingNowConfig, key: string) {
  const modes = cleanPlayingNowModes(cfg.modes);
  const saved = pending.get(key);
  const choice = saved ?? { mode: modes[0], need: 2, mins: Math.min(60, cfg.maxMinutes) };
  if (!modes.includes(choice.mode)) choice.mode = modes[0];
  if (choice.mins > cfg.maxMinutes) choice.mins = cfg.maxMinutes;
  return choice;
}

async function createPost(client: Client, interaction: ButtonInteraction | ModalSubmitInteraction, note: string | null): Promise<string> {
  const guildId = interaction.guildId!;
  const cfg = await config(guildId);
  if (!cfg?.channelId) return "Playing Now isn't set up yet.";
  const key = `${guildId}:${interaction.user.id}`;
  const choice = choiceFor(cfg, key);
  return lock(guildId)(async () => {
    const mine = await prisma.playingNowPost.findFirst({ where: { guildId, userId: interaction.user.id, endedAt: null } });
    if (mine) return "You already have a post up. Use **+30 min** or **I'm done** on it.";
    const guild = interaction.guild;
    const member = await guild?.members.fetch(interaction.user.id).catch(() => null);
    const voiceId = member?.voice.channelId ?? null;
    let post = await prisma.playingNowPost.create({
      data: { guildId, userId: interaction.user.id, mode: choice.mode, need: choice.need, note, voiceId, seenVoice: !!voiceId, endsAt: new Date(Date.now() + choice.mins * 60_000) },
    });
    pending.delete(key);
    await setRole(guild, interaction.user.id, cfg.roleId, true);
    const channel = await client.channels.fetch(cfg.channelId!).catch(() => null);
    if (!isSendableChannel(channel)) return "I can't post in the Playing Now channel. Ask staff to check my permissions.";
    const ping = !!cfg.notifyRoleId && (!cfg.lastPingAt || Date.now() - cfg.lastPingAt.getTime() >= cfg.pingCooldown * 60_000);
    const sent = await channel
      .send({ ...postMessage(post, member?.displayName ?? interaction.user.username, member?.displayAvatarURL() ?? null), content: ping ? `<@&${cfg.notifyRoleId}>` : undefined, allowedMentions: { roles: ping ? [cfg.notifyRoleId!] : [] } })
      .catch((err) => {
        logError("bot", err, guildId);
        return null;
      });
    if (sent) post = await prisma.playingNowPost.update({ where: { id: post.id }, data: { messageId: sent.id } });
    if (ping) await prisma.playingNowConfig.update({ where: { guildId }, data: { lastPingAt: new Date() } });
    await syncPlayingNowPanel(client, guildId, true);
    const length = choice.mins === 120 ? "2 hours" : choice.mins === 60 ? "1 hour" : `${choice.mins} minutes`;
    return `🎮 You're on! ${cfg.roleId ? `You have <@&${cfg.roleId}> for ${length}` : `Your post is up for ${length}`}.${sent ? ` ${sent.url}` : ""}${voiceId ? "" : "\n-# Jump in a voice channel so people can find you."}`;
  });
}

export async function handlePlayingNow(interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction) {
  const guildId = interaction.guildId!;
  const { client, user } = interaction;
  const cfg = await config(guildId);
  if (!cfg) {
    if (interaction.isRepliable()) await interaction.reply({ content: "Playing Now isn't set up yet.", ephemeral: true });
    return;
  }
  const key = `${guildId}:${user.id}`;
  const [prefix, action, postId] = interaction.customId.split(":");

  const mm = await prisma.matchmakingConfig.findUnique({ where: { guildId }, select: { playerRoleId: true, setupCategoryId: true, staffRoleId: true } });
  if (mm?.playerRoleId && mm.setupCategoryId && cfg.channelId) {
    const ch = await client.channels.fetch(cfg.channelId).catch(() => null);
    const member = await interaction.guild?.members.fetch(user.id).catch(() => null);
    const staff = !!member && (member.permissions.has(PermissionFlagsBits.ManageGuild) || (!!mm.staffRoleId && member.roles.cache.has(mm.staffRoleId)));
    if (ch && "parentId" in ch && ch.parentId === mm.setupCategoryId && member && !member.roles.cache.has(mm.playerRoleId) && !staff && interaction.isRepliable()) {
      const { roleButtons } = await import("../matches/serverSetup");
      await interaction.reply({ content: `🔒 **This is for players.** Get <@&${mm.playerRoleId}> to play: tap **Let me play** below.`, components: [roleButtons()], ephemeral: true, allowedMentions: { parse: [] } });
      return;
    }
  }

  if (prefix === "pnset" && interaction.isStringSelectMenu()) {
    const choice = choiceFor(cfg, key);
    const value = interaction.values[0];
    if (action === "mode") choice.mode = value;
    if (action === "need") choice.need = Math.min(5, Math.max(1, Number(value) || 1));
    if (action === "mins") choice.mins = Math.min(cfg.maxMinutes, Number(value) || 60);
    pending.set(key, choice);
    await interaction.update(setupScreen(cfg, choice));
    return;
  }
  if (prefix === "pnnote" && interaction.isModalSubmit()) {
    await interaction.deferReply({ ephemeral: true });
    const note = interaction.fields.getTextInputValue("note").replace(/\s+/g, " ").trim().slice(0, 100) || null;
    await interaction.editReply(await createPost(client, interaction, note));
    return;
  }
  if (!interaction.isButton()) return;

  if (action === "on") {
    const mine = await prisma.playingNowPost.findFirst({ where: { guildId, userId: user.id, endedAt: null } });
    if (mine) return void (await interaction.reply({ content: "You already have a post up. Use **+30 min** or **I'm done** on it.", ephemeral: true }));
    await interaction.reply({ ...setupScreen(cfg, choiceFor(cfg, key)), ephemeral: true });
    return;
  }
  if (action === "note") {
    const input = new TextInputBuilder().setCustomId("note").setLabel("Note (optional)").setPlaceholder("e.g. Gold 1, mic on, chill games").setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(false);
    await interaction.showModal(new ModalBuilder().setCustomId("pnnote").setTitle("I'm on now").addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input)));
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  if (action === "post") return void (await interaction.editReply({ content: await createPost(client, interaction, null), components: [] }));
  if (action === "notify") {
    if (!cfg.notifyRoleId) return void (await interaction.editReply("Notify isn't set up here."));
    const member = await interaction.guild?.members.fetch(user.id).catch(() => null);
    if (!member) return;
    const has = member.roles.cache.has(cfg.notifyRoleId);
    const ok = await (has ? member.roles.remove(cfg.notifyRoleId) : member.roles.add(cfg.notifyRoleId)).then(() => true).catch(() => false);
    if (!ok) return void (await interaction.editReply("I couldn't change that role. Ask staff to check my role is above it."));
    return void (await interaction.editReply(has ? "🔕 You won't be pinged anymore." : `🔔 You'll be pinged when someone's on (at most once every ${cfg.pingCooldown} min). Tap again to stop.`));
  }

  const reply = await lock(guildId)(async (): Promise<string> => {
    const post = postId ? await prisma.playingNowPost.findUnique({ where: { id: postId } }) : null;
    if (!post || post.guildId !== guildId || post.endedAt) return "This post has ended.";
    const staff = interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages) ?? false;
    if (action === "done") {
      if (post.userId !== user.id && !staff) return "Only the person who posted it can end it.";
      await endPost(client, post);
      return "⏹️ Ended. The Playing Now role came off.";
    }
    if (action === "more") {
      if (post.userId !== user.id) return "Only the person who posted it can add time.";
      const endsAt = new Date(Math.min(post.endsAt.getTime() + 30 * 60_000, Date.now() + cfg.maxMinutes * 60_000));
      const updated = await prisma.playingNowPost.update({ where: { id: post.id }, data: { endsAt } });
      await refreshPost(client, updated);
      return `⏱️ Your post now ends ${at(endsAt)}.`;
    }
    if (action === "join") {
      if (post.userId === user.id) return "That's your own post.";
      const joined = ids(post.joined);
      if (joined.includes(user.id)) {
        const updated = await prisma.playingNowPost.update({ where: { id: post.id }, data: { joined: joined.filter((id) => id !== user.id) } });
        await refreshPost(client, updated);
        await syncPlayingNowPanel(client, guildId);
        return "You left the squad.";
      }
      if (joined.length >= post.need) return "That squad's full. Post your own with **I'm on now**!";
      const updated = await prisma.playingNowPost.update({ where: { id: post.id }, data: { joined: [...joined, user.id] } });
      await refreshPost(client, updated);
      await syncPlayingNowPanel(client, guildId);
      const channel = cfg.channelId ? await client.channels.fetch(cfg.channelId).catch(() => null) : null;
      if (isSendableChannel(channel)) {
        const note = await channel.send({ content: `🙋 <@${post.userId}>, <@${user.id}> wants to play ${post.mode} with you!`, allowedMentions: { users: [post.userId] } }).catch(() => null);
        if (note) setTimeout(() => void note.delete().catch(() => null), JOIN_PING_MS).unref?.();
      }
      return `🙋 You're in! <@${post.userId}> got a ping.${post.voiceId ? ` Hop in <#${post.voiceId}>.` : ""} Tap **Join** again to leave.`;
    }
    return "That button is out of date.";
  });
  await interaction.editReply(reply);
}

// ---- Timer ----

export async function tickPlayingNow(client: Client) {
  const now = Date.now();
  const active = await prisma.playingNowPost.findMany({ where: { endedAt: null }, take: 200 });
  const configs = new Map<string, PlayingNowConfig | null>();
  for (const post of active) {
    if (!configs.has(post.guildId)) configs.set(post.guildId, await config(post.guildId));
    const cfg = configs.get(post.guildId);
    await lock(post.guildId)(async () => {
      const fresh = await prisma.playingNowPost.findUnique({ where: { id: post.id } });
      if (!fresh || fresh.endedAt) return;
      if (fresh.endsAt.getTime() <= now) return endPost(client, fresh);
      if (!cfg?.endOnVoiceLeave) return;
      const guild = client.guilds.cache.get(fresh.guildId);
      if (!guild) return;
      const voiceId = guild.voiceStates.cache.get(fresh.userId)?.channelId ?? null;
      if (voiceId) {
        if (!fresh.seenVoice || fresh.awaySince || fresh.voiceId !== voiceId) {
          const updated = await prisma.playingNowPost.update({ where: { id: fresh.id }, data: { seenVoice: true, awaySince: null, voiceId } });
          if (fresh.voiceId !== voiceId) await refreshPost(client, updated);
        }
      } else if (fresh.seenVoice) {
        if (!fresh.awaySince) await prisma.playingNowPost.update({ where: { id: fresh.id }, data: { awaySince: new Date() } });
        else if (now - fresh.awaySince.getTime() >= AWAY_MS) await endPost(client, fresh);
      }
    }).catch((err) => logError("bot", err, post.guildId));
  }

  // Ended posts are tidied away after a while; old rows are dropped.
  const old = await prisma.playingNowPost.findMany({ where: { endedAt: { lte: new Date(now - CLEANUP_MS) }, messageId: { not: null } }, take: 50 });
  for (const post of old) {
    const cfg = configs.get(post.guildId) ?? (await config(post.guildId));
    const channel = cfg?.channelId ? await client.channels.fetch(cfg.channelId).catch(() => null) : null;
    if (isSendableChannel(channel)) await (await channel.messages.fetch(post.messageId!).catch(() => null))?.delete().catch(() => null);
    await prisma.playingNowPost.update({ where: { id: post.id }, data: { messageId: null } });
  }
  await prisma.playingNowPost.deleteMany({ where: { endedAt: { lte: new Date(now - 7 * 86_400_000) } } });

  // Panels that are set up but not posted yet (a new channel clears the id).
  const unposted = await prisma.playingNowConfig.findMany({ where: { channelId: { not: null }, panelMessageId: null }, select: { guildId: true }, take: 20 });
  for (const { guildId } of unposted) await syncPlayingNowPanel(client, guildId).catch((err) => logError("bot", err, guildId));
}

// The dashboard's "Make the roles for me" button.
export async function createPlayingNowRoles(client: Client, guildId: string): Promise<{ roleId: string | null; notifyRoleId: string | null; error: string | null }> {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return { roleId: null, notifyRoleId: null, error: "Spartacus isn't in that server." };
  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) return { roleId: null, notifyRoleId: null, error: "Spartacus needs the Manage Roles permission." };
  const cfg = await config(guildId);
  await guild.roles.fetch();
  const find = (id: string | null | undefined, name: string) => (id ? guild.roles.cache.get(id) : undefined) ?? guild.roles.cache.find((r) => r.name === name);
  const playing =
    find(cfg?.roleId, "🎮 Playing Now") ??
    (await guild.roles.create({ name: "🎮 Playing Now", color: GREEN, hoist: true, mentionable: false, permissions: [], reason: "Playing Now" }).catch(() => undefined));
  const notify =
    find(cfg?.notifyRoleId, "🔔 Play Notify") ??
    (await guild.roles.create({ name: "🔔 Play Notify", color: 0x95a5a6, hoist: false, mentionable: true, permissions: [], reason: "Playing Now pings" }).catch(() => undefined));
  return { roleId: playing?.id ?? null, notifyRoleId: notify?.id ?? null, error: playing && notify ? null : "Couldn't create a role. Check Spartacus's permissions." };
}
