import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  GuildMember,
  Interaction,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  type ButtonInteraction,
  type InteractionEditReplyOptions,
  type MessageActionRowComponentBuilder,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type UserSelectMenuInteraction,
} from "discord.js";
import type { MatchChallenge, MatchPreset, MatchRoom, MatchTeam, MatchmakingConfig } from "@prisma/client";
import { logError } from "@spartacus/db";
import { prisma } from "../../lib/prisma";
import { isSendableChannel } from "../../lib/channels";
import { cleanTeamName, pickOne } from "./engine";
import { syncBoard } from "./leaderboard";
import { withLock } from "./lock";
import { stringList } from "./render";

const CONFIRM_MS = 5 * 60_000;
const OPEN_ROOMS = ["LIVE", "CONFIRM"];
const POST_ERROR_GAP_MS = 10 * 60_000;
const lastPostError = new Map<string, number>();

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;
type Kind = "SOLO" | "TEAM";
type Side = { name: string; players: string[]; captain: string };
type Reply = string | InteractionEditReplyOptions;
type Choosing = ButtonInteraction | StringSelectMenuInteraction;

const row = (...items: MessageActionRowComponentBuilder[]) => new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...items);
const button = (id: string, label: string, style: ButtonStyle) => new ButtonBuilder().setCustomId(id).setLabel(label.slice(0, 80)).setStyle(style);
const mentionAll = (ids: string[]) => ids.map((id) => `<@${id}>`).join(" ");

const lock = (guildId: string) => <T>(run: () => Promise<T>) => withLock(`mm:${guildId}`, run);
const getConfig = (guildId: string) => prisma.matchmakingConfig.findUnique({ where: { guildId } });
const presetFor = (guildId: string, game: string): Promise<MatchPreset | null> => prisma.matchPreset.findFirst({ where: { guildId, game, deleted: false } });
const teamSizeFor = (preset: MatchPreset | null) => Math.max(2, preset?.teamSize ?? 5);

function isStaff(member: GuildMember | null | undefined, config: MatchmakingConfig | null) {
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.ManageGuild) || (!!config?.staffRoleId && member.roles.cache.has(config.staffRoleId));
}

async function openRoomFor(guildId: string, ids: string[]): Promise<MatchRoom | null> {
  const rooms = await prisma.matchRoom.findMany({ where: { guildId, status: { in: OPEN_ROOMS } } });
  return rooms.find((r) => [...stringList(r.aPlayers), ...stringList(r.bPlayers)].some((id) => ids.includes(id))) ?? null;
}

const inRoomMessage = (room: MatchRoom) => (room.threadId ? `Finish your current match first: <#${room.threadId}>` : "Finish your current match first.");

// ---- The always-open board ----

async function buildPanel(config: MatchmakingConfig) {
  const queue = await prisma.matchQueue.findMany({ where: { guildId: config.guildId }, orderBy: { joinedAt: "asc" } });
  const teamIds = queue.flatMap((q) => (q.teamId ? [q.teamId] : []));
  const teams = await prisma.matchTeam.findMany({ where: { id: { in: teamIds } } });
  const live = await prisma.matchRoom.count({ where: { guildId: config.guildId, status: { in: OPEN_ROOMS } } });
  const solo = queue.filter((q) => q.kind === "SOLO");
  const squads = queue.filter((q) => q.kind === "TEAM");
  const lines = (list: string[]) => list.slice(0, 15).join("\n").slice(0, 1024) || "Nobody yet";

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x7b99bc)
        .setTitle("⚔️ 1v1 Matchmaking")
        .setDescription("Find an opponent or challenge someone. Spartacus sets up the match right away.")
        .addFields({ name: `Waiting (${solo.length})`, value: lines(solo.map((q) => `<@${q.userId}> · ${q.game}`)) }),
      new EmbedBuilder()
        .setColor(0xf0b232)
        .setTitle("👥 Team Matchmaking")
        .setDescription("Create a team once, then queue or challenge any time.")
        .addFields({ name: `Teams waiting (${squads.length})`, value: lines(squads.map((q) => `${teams.find((t) => t.id === q.teamId)?.name ?? "A team"} · ${q.game}`)) })
        .setFooter({ text: `${live} match${live === 1 ? "" : "es"} live now · Open all day` }),
    ],
    components: [
      row(button("mm:find:SOLO", "1v1: Find a Match", ButtonStyle.Success), button("mm:challenge:SOLO", "1v1: Challenge a Player", ButtonStyle.Primary), button("mm:leave:SOLO", "Leave 1v1 Queue", ButtonStyle.Secondary)),
      row(button("mm:find:TEAM", "Teams: Find a Match", ButtonStyle.Success), button("mm:challenge:TEAM", "Teams: Challenge a Team", ButtonStyle.Primary), button("mm:leave:TEAM", "Leave Team Queue", ButtonStyle.Secondary)),
      row(button("mm:newteam", "Create a Team", ButtonStyle.Secondary), button("mm:myteam", "My Teams", ButtonStyle.Secondary)),
    ],
    allowedMentions: { parse: [] as never[] },
  };
}

export async function syncMatchmakingPanel(client: Client, guildId: string) {
  const config = await getConfig(guildId);
  if (!config?.enabled || !config.channelId) return;
  const channel = await client.channels.fetch(config.channelId).catch(() => null);
  if (!isSendableChannel(channel)) return;
  const payload = await buildPanel(config);

  if (config.messageId) {
    const message = await channel.messages.fetch(config.messageId).catch(() => null);
    if (await message?.edit(payload).catch(() => null)) return;
  }
  const sent = await channel.send(payload).catch((err) => {
    if (Date.now() - (lastPostError.get(guildId) ?? 0) > POST_ERROR_GAP_MS) {
      lastPostError.set(guildId, Date.now());
      logError("bot", err, guildId);
    }
    return null;
  });
  if (sent) await prisma.matchmakingConfig.update({ where: { guildId }, data: { messageId: sent.id } });
}

// ---- Match rooms ----

function roomEmbed(room: MatchRoom) {
  const embed = new EmbedBuilder()
    .setColor(room.status === "DONE" ? 0xf0b232 : room.status === "CANCELED" ? 0xed4245 : 0x3ba55d)
    .setTitle(`${room.status === "CANCELED" ? "Canceled" : "🔴 LIVE"}: ${room.aName} vs ${room.bName}`.slice(0, 256))
    .setDescription(`${room.game}${room.map ? ` on ${room.map}` : ""}`)
    .addFields({ name: room.aName.slice(0, 256), value: mentionAll(stringList(room.aPlayers)).slice(0, 1024), inline: true }, { name: room.bName.slice(0, 256), value: mentionAll(stringList(room.bPlayers)).slice(0, 1024), inline: true });
  if (room.status === "CONFIRM") embed.addFields({ name: "Waiting for confirmation", value: `<@${room.reportedBy}> reported **${room.reportSide === "a" ? room.aName : room.bName}** won ${room.reportHigh}-${room.reportLow}. It's accepted automatically in 5 minutes.` });
  embed.setFooter({ text: room.disputes >= 2 ? "Staff report this result" : "One side reports, the other confirms" });
  return embed;
}

function roomButtons(room: MatchRoom): Row[] {
  if (room.status === "CONFIRM") return [row(button(`mmroom:${room.id}:confirm`, "Confirm", ButtonStyle.Success), button(`mmroom:${room.id}:dispute`, "Dispute", ButtonStyle.Danger))];
  if (room.status !== "LIVE") return [];
  return [row(button(`mmroom:${room.id}:report:a`, `${room.aName} Won`, ButtonStyle.Primary), button(`mmroom:${room.id}:report:b`, `${room.bName} Won`, ButtonStyle.Secondary), button(`mmroom:${room.id}:cancel`, "Cancel Match", ButtonStyle.Danger))];
}

async function roomThread(client: Client, room: MatchRoom) {
  if (!room.threadId) return null;
  const thread = await client.channels.fetch(room.threadId).catch(() => null);
  return thread?.isThread() ? thread : null;
}

async function refreshRoom(client: Client, room: MatchRoom) {
  const thread = await roomThread(client, room);
  const message = room.messageId ? await thread?.messages.fetch(room.messageId).catch(() => null) : null;
  await message?.edit({ embeds: [roomEmbed(room)], components: roomButtons(room) }).catch(() => null);
}

async function openRoom(client: Client, config: MatchmakingConfig, kind: Kind, game: string, a: Side, b: Side) {
  const { guildId } = config;
  const updated = await prisma.matchmakingConfig.update({ where: { guildId }, data: { nextRoomNumber: { increment: 1 } } });
  const preset = await presetFor(guildId, game);
  const maps = preset?.useMaps ? stringList(preset.maps) : [];
  const everyone = [...a.players, ...b.players];
  await prisma.matchQueue.deleteMany({ where: { guildId, userId: { in: [...everyone, a.captain, b.captain] } } });

  let room = await prisma.matchRoom.create({
    data: {
      guildId,
      number: updated.nextRoomNumber - 1,
      kind,
      game,
      aName: a.name,
      bName: b.name,
      aPlayers: a.players,
      bPlayers: b.players,
      aCaptain: a.captain,
      bCaptain: b.captain,
      map: maps.length ? pickOne(maps) : null,
      expiresAt: new Date(Date.now() + config.reportHours * 3_600_000),
    },
  });

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  const parent = config.channelId ? await client.channels.fetch(config.channelId).catch(() => null) : null;
  if (!guild || parent?.type !== ChannelType.GuildText) return room;

  const title = `${a.name} vs ${b.name}`.slice(0, 100);
  const thread =
    (await parent.threads.create({ name: title, type: ChannelType.PrivateThread, invitable: false, autoArchiveDuration: 1440 }).catch(() => null)) ??
    (await parent.threads.create({ name: title, type: ChannelType.PublicThread, autoArchiveDuration: 1440 }).catch((err) => {
      logError("bot", err, guildId);
      return null;
    }));

  const voiceIds: string[] = [];
  const notes: string[] = [];
  if (config.createVoice) {
    const rooms: Array<{ name: string; cap: number; players: string[] }> = kind === "SOLO" ? [{ name: title, cap: 2, players: everyone }] : [a, b].map((t) => ({ name: t.name, cap: t.players.length, players: t.players }));
    for (const r of rooms) {
      const voice = await guild.channels.create({ name: r.name.slice(0, 100), type: ChannelType.GuildVoice, parent: config.voiceCategoryId ?? parent.parentId ?? undefined, userLimit: Math.min(99, r.cap) }).catch((err) => {
        logError("bot", err, guildId);
        return null;
      });
      if (!voice) {
        notes.push("I couldn't create a voice channel. Check that I have Manage Channels.");
        continue;
      }
      voiceIds.push(voice.id);
      const missing: string[] = [];
      for (const id of r.players) {
        const member = await guild.members.fetch({ user: id, force: true }).catch(() => null);
        const moved = member?.voice.channelId ? await member.voice.setChannel(voice.id).catch(() => null) : null;
        if (!moved) missing.push(id);
      }
      if (missing.length) notes.push(`${mentionAll(missing)} Join <#${voice.id}>.`);
    }
  }

  room = await prisma.matchRoom.update({ where: { id: room.id }, data: { threadId: thread?.id ?? null, voiceIds } });
  if (thread) {
    for (const id of everyone) await thread.members.add(id).catch(() => null);
    const card = await thread
      .send({ content: [mentionAll(everyone), ...notes].join("\n").slice(0, 2000), embeds: [roomEmbed(room)], components: roomButtons(room), allowedMentions: { parse: ["users"] } })
      .catch((err) => {
        logError("bot", err, guildId);
        return null;
      });
    if (card) room = await prisma.matchRoom.update({ where: { id: room.id }, data: { messageId: card.id } });
  }
  return room;
}

async function closeRoom(client: Client, room: MatchRoom, closing: string) {
  for (const id of stringList(room.voiceIds)) {
    const voice = await client.channels.fetch(id).catch(() => null);
    await voice?.delete().catch((err) => logError("bot", err, room.guildId));
  }
  await refreshRoom(client, room);
  const thread = await roomThread(client, room);
  await thread?.send({ content: closing, allowedMentions: { parse: [] } }).catch(() => null);
  await thread?.setLocked(true).catch(() => null);
  await thread?.setArchived(true).catch(() => null);
}

async function finishRoom(client: Client, room: MatchRoom, side: string, high: number, low: number) {
  const config = await getConfig(room.guildId);
  const done = await prisma.matchRoom.update({ where: { id: room.id }, data: { status: "DONE", reportSide: side, reportHigh: high, reportLow: low, voiceIds: [], expiresAt: null } });
  const [winner, loser, won, lost] = side === "a" ? [room.aName, room.bName, stringList(room.aPlayers), stringList(room.bPlayers)] : [room.bName, room.aName, stringList(room.bPlayers), stringList(room.aPlayers)];
  const ranked = config?.ranked ?? true;
  await prisma.matchResult.create({
    data: {
      guildId: room.guildId,
      number: room.number,
      game: room.game,
      map: room.map,
      winnerName: winner,
      loserName: loser,
      winnerScore: high,
      loserScore: low,
      winners: ranked ? won : [],
      losers: ranked ? lost : [],
      winnerTeam: ranked && room.kind === "TEAM" ? winner : null,
      loserTeam: ranked && room.kind === "TEAM" ? loser : null,
    },
  });
  await closeRoom(client, { ...done, voiceIds: room.voiceIds }, `🏆 **${winner}** won ${high}-${low}. This match is closed.`);
  await syncBoard(client, room.guildId);
  await syncMatchmakingPanel(client, room.guildId);
}

export async function cancelRoom(client: Client, roomId: string): Promise<boolean> {
  const room = await prisma.matchRoom.findUnique({ where: { id: roomId } });
  if (!room || !OPEN_ROOMS.includes(room.status)) return false;
  await lock(room.guildId)(async () => {
    const closed = await prisma.matchRoom.update({ where: { id: room.id }, data: { status: "CANCELED", voiceIds: [], expiresAt: null } });
    await closeRoom(client, { ...closed, voiceIds: room.voiceIds }, "This match was canceled and nothing was recorded.");
    await syncMatchmakingPanel(client, room.guildId);
  });
  return true;
}

// ---- Player actions ----

async function chooseGame(interaction: Choosing, config: MatchmakingConfig, action: string, kind: string): Promise<string | null> {
  const games = stringList(config.games);
  if (games.length === 1) return games[0];
  if (games.length === 0) {
    await interaction.editReply("Staff haven't added any games yet.");
    return null;
  }
  const menu = new StringSelectMenuBuilder().setCustomId(`mmgame:${action}:${kind}`).setPlaceholder("Pick a game").addOptions(games.slice(0, 25).map((g, i) => ({ label: g.slice(0, 100), value: String(i) })));
  await interaction.editReply({ content: "Which game?", components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)] });
  return null;
}

const readyTeam = async (guildId: string, game: string, captainId: string) => {
  const team = await prisma.matchTeam.findFirst({ where: { guildId, game, captainId } });
  if (!team) return null;
  return team;
};

const sideOf = (team: MatchTeam): Side => ({ name: team.name, players: stringList(team.players), captain: team.captainId });

async function find(client: Client, config: MatchmakingConfig, kind: Kind, game: string, userId: string, guild: Interaction["guild"]): Promise<Reply> {
  const { guildId } = config;
  if (kind === "SOLO") {
    const busy = await openRoomFor(guildId, [userId]);
    if (busy) return inRoomMessage(busy);
    const rival = await prisma.matchQueue.findFirst({ where: { guildId, game, kind, userId: { not: userId } }, orderBy: { joinedAt: "asc" } });
    if (rival) {
      const names = await Promise.all([userId, rival.userId].map((id) => guild?.members.fetch(id).catch(() => null)));
      const side = (id: string, i: number): Side => ({ name: names[i]?.displayName ?? "Player", players: [id], captain: id });
      const room = await openRoom(client, config, kind, game, side(rival.userId, 1), side(userId, 0));
      return room.threadId ? `Match found: <#${room.threadId}>` : "Match found.";
    }
    await prisma.matchQueue.upsert({ where: { guildId_game_kind_userId: { guildId, game, kind, userId } }, create: { guildId, game, kind, userId }, update: {} });
    return `You're in the ${game} queue. You'll be tagged when someone joins.`;
  }

  const team = await readyTeam(guildId, game, userId);
  if (!team) return `You need to be the captain of a ${game} team. Tap Create a Team first.`;
  if (stringList(team.players).length < teamSizeFor(await presetFor(guildId, game))) return `${team.name} needs more players. Tap My Teams to finish it.`;
  const busy = await openRoomFor(guildId, stringList(team.players));
  if (busy) return inRoomMessage(busy);
  const rival = await prisma.matchQueue.findFirst({ where: { guildId, game, kind, userId: { not: userId } }, orderBy: { joinedAt: "asc" } });
  const other = rival?.teamId ? await prisma.matchTeam.findUnique({ where: { id: rival.teamId } }) : null;
  if (other) {
    const room = await openRoom(client, config, kind, game, sideOf(other), sideOf(team));
    return room.threadId ? `Match found: <#${room.threadId}>` : "Match found.";
  }
  await prisma.matchQueue.upsert({ where: { guildId_game_kind_userId: { guildId, game, kind, userId } }, create: { guildId, game, kind, userId, teamId: team.id }, update: {} });
  return `${team.name} is in the ${game} queue.`;
}

async function challengePicker(config: MatchmakingConfig, kind: Kind, game: string, userId: string): Promise<Reply> {
  const index = stringList(config.games).indexOf(game);
  if (kind === "SOLO") {
    const busy = await openRoomFor(config.guildId, [userId]);
    if (busy) return inRoomMessage(busy);
    return { content: `Who do you want to challenge in ${game}?`, components: [new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(new UserSelectMenuBuilder().setCustomId(`mmuser:${index}`).setPlaceholder("Pick a player"))] };
  }
  const mine = await readyTeam(config.guildId, game, userId);
  if (!mine) return `You need to be the captain of a ${game} team first.`;
  const teams = await prisma.matchTeam.findMany({ where: { guildId: config.guildId, game, id: { not: mine.id } }, take: 25 });
  if (teams.length === 0) return `There aren't any other ${game} teams yet.`;
  const menu = new StringSelectMenuBuilder().setCustomId(`mmteamsel:${index}`).setPlaceholder("Pick a team").addOptions(teams.map((t) => ({ label: t.name.slice(0, 100), value: t.id })));
  return { content: `Which team do you want to challenge in ${game}?`, components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)] };
}

async function sendChallenge(client: Client, config: MatchmakingConfig, data: Pick<MatchChallenge, "game" | "kind" | "fromId" | "toId" | "fromTeam" | "toTeam">): Promise<string> {
  const { guildId, challengeMinutes } = config;
  const channel = config.channelId ? await client.channels.fetch(config.channelId).catch(() => null) : null;
  if (!isSendableChannel(channel)) return "The Matchmaking channel isn't available.";
  const challenge = await prisma.matchChallenge.create({ data: { ...data, guildId, expiresAt: new Date(Date.now() + challengeMinutes * 60_000) } });
  const who = data.fromTeam ? `**${data.fromTeam}** challenged **${data.toTeam}**` : `<@${data.fromId}> challenged you`;
  const message = await channel
    .send({
      content: `<@${data.toId}> ${who} to ${data.game}. This expires <t:${Math.floor(challenge.expiresAt.getTime() / 1000)}:R>.`,
      components: [row(button(`mmans:${challenge.id}:accept`, "Accept", ButtonStyle.Success), button(`mmans:${challenge.id}:decline`, "Decline", ButtonStyle.Danger))],
      allowedMentions: { users: [data.toId] },
    })
    .catch(() => null);
  if (message) await prisma.matchChallenge.update({ where: { id: challenge.id }, data: { messageId: message.id } });
  return `Challenge sent. It expires in ${challengeMinutes} minutes.`;
}

async function dropChallenge(client: Client, challenge: MatchChallenge, config: MatchmakingConfig | null) {
  await prisma.matchChallenge.delete({ where: { id: challenge.id } }).catch(() => null);
  if (!challenge.messageId || !config?.channelId) return;
  const channel = await client.channels.fetch(config.channelId).catch(() => null);
  if (!isSendableChannel(channel)) return;
  const message = await channel.messages.fetch(challenge.messageId).catch(() => null);
  await message?.delete().catch(() => null);
}

async function answerChallenge(interaction: ButtonInteraction, id: string, accept: boolean): Promise<string> {
  const { client, guildId, user, guild } = interaction;
  const challenge = await prisma.matchChallenge.findUnique({ where: { id } });
  if (!challenge || challenge.expiresAt < new Date()) return "This challenge has expired.";
  if (challenge.toId !== user.id) return "This challenge isn't for you.";
  const config = await getConfig(guildId!);
  if (!config) return "Matchmaking isn't set up.";
  await dropChallenge(client, challenge, config);
  if (!accept) return "Challenge declined.";

  let a: Side, b: Side;
  if (challenge.kind === "TEAM") {
    const teams = await prisma.matchTeam.findMany({ where: { guildId: guildId!, game: challenge.game, name: { in: [challenge.fromTeam ?? "", challenge.toTeam ?? ""] } } });
    const from = teams.find((t) => t.name === challenge.fromTeam);
    const to = teams.find((t) => t.name === challenge.toTeam);
    if (!from || !to) return "One of those teams no longer exists.";
    [a, b] = [sideOf(from), sideOf(to)];
  } else {
    const members = await Promise.all([challenge.fromId, challenge.toId].map((m) => guild?.members.fetch(m).catch(() => null)));
    a = { name: members[0]?.displayName ?? "Player", players: [challenge.fromId], captain: challenge.fromId };
    b = { name: members[1]?.displayName ?? "Player", players: [challenge.toId], captain: challenge.toId };
  }
  const busy = await openRoomFor(guildId!, [...a.players, ...b.players]);
  if (busy) return "Someone in this match is already playing.";
  const room = await openRoom(client, config, challenge.kind as Kind, challenge.game, a, b);
  await syncMatchmakingPanel(client, guildId!);
  return room.threadId ? `Match on: <#${room.threadId}>` : "Match on.";
}

async function myTeams(guildId: string, userId: string): Promise<Reply> {
  const teams = (await prisma.matchTeam.findMany({ where: { guildId } })).filter((t) => stringList(t.players).includes(userId));
  if (teams.length === 0) return "You aren't on a team yet.";
  const lines = teams.map((t) => `**${t.name}** (${t.game}): ${mentionAll(stringList(t.players))}`).join("\n").slice(0, 1900);
  const owned = teams.filter((t) => t.captainId === userId).slice(0, 5);
  const buttons = owned.map((t) => button(`mm:disband:${t.id}`, `Disband ${t.name}`, ButtonStyle.Danger));
  return { content: lines, components: buttons.length ? [row(...buttons)] : [], allowedMentions: { parse: [] } };
}

async function teamNameModal(interaction: ButtonInteraction | StringSelectMenuInteraction, index: number) {
  const field = new TextInputBuilder().setCustomId("name").setLabel("Team name").setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(32).setRequired(true);
  await interaction.showModal(new ModalBuilder().setCustomId(`mmteamname:${index}`).setTitle("Create a Team").addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(field)));
}

function matesPicker(team: MatchTeam, size: number): InteractionEditReplyOptions {
  const menu = new UserSelectMenuBuilder().setCustomId(`mmmates:${team.id}`).setPlaceholder("Pick your teammates").setMinValues(size - 1).setMaxValues(size - 1);
  return { content: `Pick ${size - 1} teammate${size === 2 ? "" : "s"} for ${team.name}.`, components: [new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(menu)] };
}

async function reportAllowed(room: MatchRoom, userId: string, staff: boolean): Promise<string | null> {
  if (staff) return null;
  if (room.disputes >= 2) return "Only staff can report this result.";
  if (room.kind === "SOLO") return [room.aCaptain, room.bCaptain].includes(userId) ? null : "Only the two players can report.";
  return [room.aCaptain, room.bCaptain].includes(userId) ? null : "Only the team captains can report.";
}

async function reply(interaction: ButtonInteraction | StringSelectMenuInteraction | UserSelectMenuInteraction | ModalSubmitInteraction, value: Reply) {
  await interaction.editReply(typeof value === "string" ? { content: value, components: [] } : value);
}

const failed = "Something went wrong with that. Staff can see the details on the Errors page.";

// Every Matchmaking button, menu and form comes through here.
export async function handleMatchmaking(interaction: Interaction) {
  if (!interaction.guildId || !(interaction.isButton() || interaction.isStringSelectMenu() || interaction.isUserSelectMenu() || interaction.isModalSubmit())) return;
  const { guildId, client, user } = interaction;
  const parts = interaction.customId.split(":");
  const [prefix] = parts;
  const run = lock(guildId);
  const member = await interaction.guild?.members.fetch(user.id).catch(() => null);

  try {
    const config = await getConfig(guildId);
    if (!config) {
      if (interaction.isRepliable()) await interaction.reply({ content: "Matchmaking isn't set up yet.", ephemeral: true });
      return;
    }
    const games = stringList(config.games);

    if (prefix === "mm" && interaction.isButton()) {
      const [, action, arg] = parts;
      if (action === "newteam" && games.length === 1) return void (await teamNameModal(interaction, 0));
      await interaction.deferReply({ ephemeral: true });
      if (action === "find" || action === "challenge" || action === "newteam") {
        const game = await chooseGame(interaction, config, action, arg ?? "");
        if (!game) return;
        const value = await run(async () => (action === "find" ? find(client, config, arg as Kind, game, user.id, interaction.guild) : challengePicker(config, arg as Kind, game, user.id)));
        await reply(interaction, value);
      } else if (action === "leave") {
        await run(() => prisma.matchQueue.deleteMany({ where: { guildId, userId: user.id, kind: arg } }));
        await reply(interaction, "You left the queue.");
      } else if (action === "myteam") {
        await reply(interaction, await myTeams(guildId, user.id));
      } else if (action === "disband") {
        const value = await run(async () => {
          const team = await prisma.matchTeam.findUnique({ where: { id: arg } });
          if (!team || team.guildId !== guildId || team.captainId !== user.id) return "Only the captain can do that.";
          await prisma.matchQueue.deleteMany({ where: { teamId: team.id } });
          await prisma.matchTeam.delete({ where: { id: team.id } });
          return `${team.name} was disbanded. Its leaderboard record stays.`;
        });
        await reply(interaction, value);
      }
      await syncMatchmakingPanel(client, guildId);
      return;
    }

    if (prefix === "mmgame" && interaction.isStringSelectMenu()) {
      const [, action, kind] = parts;
      const game = games[Number(interaction.values[0])];
      if (action === "newteam") return void (await teamNameModal(interaction, Number(interaction.values[0])));
      await interaction.deferUpdate();
      await reply(interaction, await run(async () => (action === "find" ? find(client, config, kind as Kind, game, user.id, interaction.guild) : challengePicker(config, kind as Kind, game, user.id))));
      await syncMatchmakingPanel(client, guildId);
      return;
    }

    if (prefix === "mmuser" && interaction.isUserSelectMenu()) {
      await interaction.deferUpdate();
      const target = interaction.users.first();
      const game = games[Number(parts[1])];
      if (!target || target.bot || target.id === user.id) return void (await reply(interaction, "Pick another player."));
      const busy = await openRoomFor(guildId, [target.id]);
      if (busy) return void (await reply(interaction, "That player is already in a match."));
      await reply(interaction, await run(() => sendChallenge(client, config, { game, kind: "SOLO", fromId: user.id, toId: target.id, fromTeam: null, toTeam: null })));
      return;
    }

    if (prefix === "mmteamsel" && interaction.isStringSelectMenu()) {
      await interaction.deferUpdate();
      const game = games[Number(parts[1])];
      const mine = await readyTeam(guildId, game, user.id);
      const other = await prisma.matchTeam.findUnique({ where: { id: interaction.values[0] } });
      if (!mine || !other) return void (await reply(interaction, "That team no longer exists."));
      await reply(interaction, await run(() => sendChallenge(client, config, { game, kind: "TEAM", fromId: user.id, toId: other.captainId, fromTeam: mine.name, toTeam: other.name })));
      return;
    }

    if (prefix === "mmans" && interaction.isButton()) {
      await interaction.deferReply({ ephemeral: true });
      await reply(interaction, await run(() => answerChallenge(interaction, parts[1], parts[2] === "accept")));
      return;
    }

    if (prefix === "mmteamname" && interaction.isModalSubmit()) {
      await interaction.deferReply({ ephemeral: true });
      const game = games[Number(parts[1])];
      const name = cleanTeamName(interaction.fields.getTextInputValue("name"));
      if (name.length < 2) return void (await reply(interaction, "Use at least 2 letters or numbers."));
      await reply(
        interaction,
        await run(async () => {
          if (await readyTeam(guildId, game, user.id)) return `You already captain a ${game} team. Tap My Teams to disband it first.`;
          const taken = await prisma.matchTeam.findFirst({ where: { guildId, game, name: { equals: name, mode: "insensitive" } } });
          if (taken) return "Another team already has that name.";
          const team = await prisma.matchTeam.create({ data: { guildId, game, name, captainId: user.id, players: [user.id] } });
          return matesPicker(team, teamSizeFor(await presetFor(guildId, game)));
        })
      );
      return;
    }

    if (prefix === "mmmates" && interaction.isUserSelectMenu()) {
      await interaction.deferUpdate();
      const team = await prisma.matchTeam.findUnique({ where: { id: parts[1] } });
      if (!team || team.captainId !== user.id) return void (await reply(interaction, "Only the captain can do that."));
      const mates = interaction.users.filter((u) => !u.bot && u.id !== user.id).map((u) => u.id);
      const size = teamSizeFor(await presetFor(guildId, team.game));
      if (mates.length !== size - 1) return void (await reply(interaction, matesPicker(team, size)));
      await prisma.matchTeam.update({ where: { id: team.id }, data: { players: [user.id, ...mates] } });
      await reply(interaction, `**${team.name}** is ready for ${team.game}: ${mentionAll([user.id, ...mates])}`);
      return;
    }

    if (prefix === "mmroom" && interaction.isButton()) {
      const [, roomId, action, side] = parts;
      const room = await prisma.matchRoom.findUnique({ where: { id: roomId } });
      if (!room || room.guildId !== guildId) return;
      const staff = isStaff(member, config);
      if (action === "report") {
        const blocked = room.status === "LIVE" ? await reportAllowed(room, user.id, staff) : "This match isn't waiting for a result.";
        if (blocked) return void (await interaction.reply({ content: blocked, ephemeral: true }));
        const preset = await presetFor(guildId, room.game);
        const word = preset?.scoreName ?? "Score";
        const field = (id: string, label: string) => new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label.slice(0, 45)).setStyle(TextInputStyle.Short).setMaxLength(4).setRequired(true));
        const winner = side === "a" ? room.aName : room.bName;
        await interaction.showModal(new ModalBuilder().setCustomId(`mmscore:${room.id}:${side}`).setTitle(`Report: ${winner} Won`.slice(0, 45)).addComponents(field("winner", `Winner ${word}`), field("loser", `Loser ${word}`)));
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      await reply(
        interaction,
        await run(async () => {
          const fresh = await prisma.matchRoom.findUnique({ where: { id: roomId } });
          if (!fresh || !OPEN_ROOMS.includes(fresh.status)) return "This match is already closed.";
          if (action === "cancel") {
            if (!staff && ![fresh.aCaptain, fresh.bCaptain].includes(user.id)) return "Only the players or staff can cancel.";
            const closed = await prisma.matchRoom.update({ where: { id: fresh.id }, data: { status: "CANCELED", voiceIds: [], expiresAt: null } });
            await closeRoom(client, { ...closed, voiceIds: fresh.voiceIds }, "This match was canceled and nothing was recorded.");
            await syncMatchmakingPanel(client, guildId);
            return "Match canceled.";
          }
          if (fresh.status !== "CONFIRM") return "There's nothing to confirm.";
          const responder = fresh.reportedBy === fresh.aCaptain ? fresh.bCaptain : fresh.aCaptain;
          if (!staff && responder !== user.id) return "Only the other side or staff can respond to this.";
          if (action === "confirm") {
            await finishRoom(client, fresh, fresh.reportSide!, fresh.reportHigh!, fresh.reportLow!);
            return "Result confirmed.";
          }
          const disputes = fresh.disputes + 1;
          const live = await prisma.matchRoom.update({ where: { id: fresh.id }, data: { status: "LIVE", disputes, reportSide: null, reportHigh: null, reportLow: null, reportedBy: null, expiresAt: new Date(Date.now() + config.reportHours * 3_600_000) } });
          await refreshRoom(client, live);
          const thread = await roomThread(client, live);
          await thread?.send({ content: disputes >= 2 ? `${config.staffRoleId ? `<@&${config.staffRoleId}> ` : ""}The result was disputed twice. Only staff can report it now.` : "Result disputed. You can report once more." }).catch(() => null);
          return "Result disputed.";
        })
      );
      return;
    }

    if (prefix === "mmscore" && interaction.isModalSubmit()) {
      await interaction.deferReply({ ephemeral: true });
      const high = Number(interaction.fields.getTextInputValue("winner"));
      const low = Number(interaction.fields.getTextInputValue("loser"));
      if (!Number.isInteger(high) || !Number.isInteger(low) || low < 0 || high <= low) return void (await reply(interaction, "The winner needs a higher score. Enter whole numbers, like 4 and 2."));
      const staff = isStaff(member, config);
      await reply(
        interaction,
        await run(async () => {
          const room = await prisma.matchRoom.findUnique({ where: { id: parts[1] } });
          if (!room || room.status !== "LIVE") return "This match isn't waiting for a result.";
          const blocked = await reportAllowed(room, user.id, staff);
          if (blocked) return blocked;
          if (staff && ![room.aCaptain, room.bCaptain].includes(user.id)) {
            await finishRoom(client, room, parts[2], high, low);
            return "Result saved.";
          }
          const pending = await prisma.matchRoom.update({ where: { id: room.id }, data: { status: "CONFIRM", reportSide: parts[2], reportHigh: high, reportLow: low, reportedBy: user.id, expiresAt: new Date(Date.now() + CONFIRM_MS) } });
          await refreshRoom(client, pending);
          const other = user.id === room.aCaptain ? room.bCaptain : room.aCaptain;
          const thread = await roomThread(client, pending);
          await thread?.send({ content: `<@${other}> Please confirm the result above.`, allowedMentions: { users: [other] } }).catch(() => null);
          return "Result sent. The other side has 5 minutes to respond.";
        })
      );
    }
  } catch (err) {
    logError("bot", err, guildId);
    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) await interaction.editReply({ content: failed, components: [] }).catch(() => null);
      else await interaction.reply({ content: failed, ephemeral: true }).catch(() => null);
    }
  }
}

// ---- Timer ----

export async function tickMatchmaking(client: Client) {
  const now = new Date();
  const configs = await prisma.matchmakingConfig.findMany({ where: { enabled: true } });
  for (const config of configs) {
    const { guildId } = config;
    if (!config.messageId) await syncMatchmakingPanel(client, guildId).catch((err) => logError("bot", err, guildId));
    const stale = await prisma.matchQueue.deleteMany({ where: { guildId, joinedAt: { lte: new Date(now.getTime() - config.queueMinutes * 60_000) } } });
    if (stale.count) await syncMatchmakingPanel(client, guildId).catch((err) => logError("bot", err, guildId));
    const expired = await prisma.matchChallenge.findMany({ where: { guildId, expiresAt: { lte: now } } });
    for (const challenge of expired) await lock(guildId)(() => dropChallenge(client, challenge, config)).catch((err) => logError("bot", err, guildId));
  }

  const rooms = await prisma.matchRoom.findMany({ where: { status: { in: OPEN_ROOMS }, expiresAt: { lte: now } }, take: 20 });
  for (const room of rooms) {
    await lock(room.guildId)(async () => {
      const fresh = await prisma.matchRoom.findUnique({ where: { id: room.id } });
      if (!fresh?.expiresAt || fresh.expiresAt > new Date()) return;
      if (fresh.status === "CONFIRM") await finishRoom(client, fresh, fresh.reportSide!, fresh.reportHigh!, fresh.reportLow!);
      else if (fresh.status === "LIVE") {
        const closed = await prisma.matchRoom.update({ where: { id: fresh.id }, data: { status: "CANCELED", voiceIds: [], expiresAt: null } });
        await closeRoom(client, { ...closed, voiceIds: fresh.voiceIds }, "Nobody reported a result in time, so this match was closed and nothing was recorded.");
        await syncMatchmakingPanel(client, fresh.guildId);
      }
    }).catch((err) => logError("bot", err, room.guildId));
  }
}
