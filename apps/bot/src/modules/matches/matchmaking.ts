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
import type { MatchChallenge, MatchPreset, MatchQueue, MatchRoom, MatchTeam, MatchmakingConfig } from "@prisma/client";
import { resolveText, textsForGame, type MatchTextKey } from "@spartacus/shared";
import { logError } from "@spartacus/db";
import { prisma } from "../../lib/prisma";
import { isSendableChannel } from "../../lib/channels";
import { cleanTeamName, pickOne, shuffle } from "./engine";
import { closeVoiceRooms, openVoiceRooms } from "./voice";
import { syncBoard } from "./leaderboard";
import { withLock } from "./lock";
import { stringList, styleEmbed } from "./render";
import { isModuleEnabled } from "../../lib/moduleGate";

const CONFIRM_MS = 5 * 60_000;
const OPEN_ROOMS = ["LIVE", "CONFIRM"];
const POST_ERROR_GAP_MS = 10 * 60_000;
// Solo players waiting to be recruited onto a team share the queue table.
const LFT = "LFT";
const LFT_HOURS = 24;
const TEAMS_SHOWN = 15;
const TEAM_LIST_CHARS = 3000;
const INVITE_HOURS = 24;
const lastPostError = new Map<string, number>();

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;
// PICKUP rooms are made on the spot from the Looking for a Team list, so they
// count for each player but never for a team.
type Kind = "SOLO" | "TEAM" | "PICKUP";
type Side = { name: string; players: string[]; captain: string };
type Reply = string | InteractionEditReplyOptions;
type Choosing = ButtonInteraction | StringSelectMenuInteraction;

const row = (...items: MessageActionRowComponentBuilder[]) => new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...items);
const button = (id: string, label: string, style: ButtonStyle) => new ButtonBuilder().setCustomId(id).setLabel(label.slice(0, 80)).setStyle(style);
const mentionAll = (ids: string[]) => ids.map((id) => `<@${id}>`).join(" ");

const lock = (guildId: string) => <T>(run: () => Promise<T>) => withLock(`mm:${guildId}`, run);
const getConfig = (guildId: string) => prisma.matchmakingConfig.findUnique({ where: { guildId } });
const textsFor = (config: MatchmakingConfig | null, game: string) => textsForGame(config?.texts, config?.gameTexts, game);
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
  const teams = await prisma.matchTeam.findMany({ where: { guildId: config.guildId }, orderBy: { createdAt: "asc" } });
  const rooms = await prisma.matchRoom.findMany({ where: { guildId: config.guildId, status: { in: OPEN_ROOMS } } });
  const presets = await prisma.matchPreset.findMany({ where: { guildId: config.guildId, deleted: false } });
  const live = rooms.length;
  const solo = queue.filter((q) => q.kind === "SOLO");
  const squads = queue.filter((q) => q.kind === "TEAM");
  const lines = (list: string[]) => list.slice(0, 15).join("\n").slice(0, 1024) || "Nobody yet";

  const say = (key: MatchTextKey) => resolveText(config.texts, key).text;
  return {
    embeds: [
      styleEmbed(new EmbedBuilder(), config.texts, "boardSolo").addFields({ name: resolveText(config.texts, "labelWaiting", { count: solo.length }).text, value: lines(solo.map((q) => `<@${q.userId}> · ${q.game}`)) }),
      styleEmbed(new EmbedBuilder(), config.texts, "boardTeam", { live: `${live} match${live === 1 ? "" : "es"}` }).addFields({ name: resolveText(config.texts, "labelTeamsWaiting", { count: squads.length }).text, value: lines(squads.map((q) => `${teams.find((t) => t.id === q.teamId)?.name ?? "A team"} · ${q.game}`)) }),
      teamListEmbed(config, teams, queue, rooms, presets),
    ],
    components: [
      row(button("mm:find:SOLO", say("btnFindSolo"), ButtonStyle.Success), button("mm:challenge:SOLO", say("btnChallengeSolo"), ButtonStyle.Primary), button("mm:leave:SOLO", say("btnLeaveSolo"), ButtonStyle.Danger)),
      row(button("mm:find:TEAM", say("btnFindTeam"), ButtonStyle.Success), button("mm:challenge:TEAM", say("btnChallengeTeam"), ButtonStyle.Primary), button("mm:leave:TEAM", say("btnLeaveTeam"), ButtonStyle.Danger)),
      row(button("mm:newteam", say("btnCreateTeam"), ButtonStyle.Secondary), button("mm:myteam", say("btnMyTeams"), ButtonStyle.Secondary), button("mm:lft", say("btnLookingForTeam"), ButtonStyle.Secondary), button("mm:pickup", say("btnPickup"), ButtonStyle.Success)),
    ],
    allowedMentions: { parse: [] as never[] },
  };
}

// Every team with its players, so people can see who's where. Someone on two
// teams shows under both, and is listed again at the bottom.
function teamListEmbed(config: MatchmakingConfig, teams: MatchTeam[], queue: MatchQueue[], rooms: MatchRoom[], presets: MatchPreset[]) {
  const say = (key: MatchTextKey, tokens: Record<string, string | number> = {}) => resolveText(config.texts, key, tokens).text;
  const embed = styleEmbed(new EmbedBuilder(), config.texts, "boardTeamList");
  const sorted = [...teams].sort((x, y) => x.game.localeCompare(y.game) || x.name.localeCompare(y.name));
  const queued = new Set(queue.filter((q) => q.kind === "TEAM").map((q) => q.teamId));
  const playing = (t: MatchTeam) => rooms.some((r) => r.kind === "TEAM" && r.game === t.game && (r.aName === t.name || r.bName === t.name));

  const teamsOf = new Map<string, string[]>();
  for (const t of sorted) for (const id of stringList(t.players)) teamsOf.set(id, [...(teamsOf.get(id) ?? []), t.name]);

  // Discord refuses a message whose embeds pass 6,000 characters, so big
  // teams stop the list early instead of breaking the whole board.
  const fields: Array<{ name: string; value: string }> = [];
  let budget = TEAM_LIST_CHARS;
  for (const t of sorted.slice(0, TEAMS_SHOWN)) {
    const players = stringList(t.players);
    const size = teamSizeFor(presets.find((p) => p.game === t.game) ?? null);
    const status = playing(t) ? " · ⚔️ playing" : queued.has(t.id) ? " · 🔍 in queue" : "";
    const names = [t.captainId, ...players.filter((id) => id !== t.captainId)].map((id) => (id === t.captainId ? `👑 <@${id}>` : `👤 <@${id}>`));
    const field = { name: `${t.name} · ${t.game} (${players.length}/${size})${status}`.slice(0, 256), value: names.join("\n").slice(0, 1024) };
    budget -= field.name.length + field.value.length;
    if (budget < 0) break;
    fields.push(field);
  }
  const shown = fields.length;
  if (sorted.length === 0) fields.push({ name: "\u200b", value: say("labelNoTeamsYet") });
  if (sorted.length > shown) fields.push({ name: "\u200b", value: `And ${sorted.length - shown} more. Tap My Teams to see yours.` });

  const shared = [...teamsOf].filter(([, names]) => names.length > 1);
  if (shared.length) fields.push({ name: say("labelMultiTeam"), value: shared.slice(0, 15).map(([id, names]) => `<@${id}>: ${names.join(", ")}`).join("\n").slice(0, 1024) });

  const lft = queue.filter((q) => q.kind === LFT);
  if (lft.length) fields.push({ name: say("labelLookingForTeam", { count: lft.length }), value: lft.slice(0, 15).map((q) => `<@${q.userId}> · ${q.game}`).join("\n").slice(0, 1024) });
  return embed.addFields(fields);
}

// Finds extra boards from two posts landing together, and keeps the saved one.
async function removeExtraPanels(client: Client, channelId: string, guildId: string) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!isSendableChannel(channel)) return;
  const keep = (await getConfig(guildId))?.messageId;
  if (!keep) return;
  const recent = await channel.messages.fetch({ limit: 30 }).catch(() => null);
  for (const message of recent?.values() ?? []) {
    const isBoard = message.components.some((r) => "components" in r && r.components.some((c) => "customId" in c && c.customId === "mm:find:SOLO"));
    if (isBoard && message.author.id === client.user?.id && message.id !== keep) await message.delete().catch(() => null);
  }
}

// The dashboard and the timer can both get here at once, so posts run in turn.
export function syncMatchmakingPanel(client: Client, guildId: string) {
  return withLock(`mmpanel:${guildId}`, () => postPanel(client, guildId));
}

const sweptGuilds = new Set<string>();

async function postPanel(client: Client, guildId: string) {
  const config = await getConfig(guildId);
  if (!config?.enabled || !config.channelId) return;
  const channel = await client.channels.fetch(config.channelId).catch(() => null);
  if (!isSendableChannel(channel)) return;
  const payload = await buildPanel(config);

  if (config.messageId) {
    const message = await channel.messages.fetch(config.messageId).catch(() => null);
    if (await message?.edit(payload).catch(() => null)) {
      if (!sweptGuilds.has(guildId)) {
        sweptGuilds.add(guildId);
        await removeExtraPanels(client, config.channelId, guildId);
      }
      return;
    }
  }
  const sent = await channel.send(payload).catch((err) => {
    if (Date.now() - (lastPostError.get(guildId) ?? 0) > POST_ERROR_GAP_MS) {
      lastPostError.set(guildId, Date.now());
      logError("bot", err, guildId);
    }
    return null;
  });
  if (!sent) return;
  await prisma.matchmakingConfig.update({ where: { guildId }, data: { messageId: sent.id } });
  sweptGuilds.add(guildId);
  await removeExtraPanels(client, config.channelId, guildId);
}

// ---- Match rooms ----

function roomEmbed(room: MatchRoom, texts: unknown) {
  const embed = styleEmbed(new EmbedBuilder(), texts, "room", { a: room.aName, b: room.bName, game: room.game, onMap: room.map ? ` on ${room.map}` : "" })
    .addFields({ name: room.aName.slice(0, 256), value: mentionAll(stringList(room.aPlayers)).slice(0, 1024), inline: true }, { name: room.bName.slice(0, 256), value: mentionAll(stringList(room.bPlayers)).slice(0, 1024), inline: true });
  if (room.status === "DONE") embed.setColor(0xf0b232);
  if (room.status === "CANCELED") embed.setColor(0xed4245).setTitle(`Canceled: ${room.aName} vs ${room.bName}`.slice(0, 256));
  if (room.status === "CONFIRM") embed.addFields({ name: "Waiting for confirmation", value: `<@${room.reportedBy}> reported **${room.reportSide === "a" ? room.aName : room.bName}** won ${room.reportHigh}-${room.reportLow}. It's accepted automatically in 5 minutes.` });
  if (room.disputes >= 2) embed.setFooter({ text: "Staff report this result" });
  return embed;
}

function roomButtons(room: MatchRoom, texts: unknown): Row[] {
  if (room.status === "CONFIRM") return [row(button(`mmroom:${room.id}:confirm`, resolveText(texts, "btnConfirm").text, ButtonStyle.Success), button(`mmroom:${room.id}:dispute`, resolveText(texts, "btnDispute").text, ButtonStyle.Danger))];
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
  const texts = textsFor(await getConfig(room.guildId), room.game);
  await message?.edit({ embeds: [roomEmbed(room, texts)], components: roomButtons(room, texts) }).catch(() => null);
}

async function openRoom(client: Client, config: MatchmakingConfig, kind: Kind, game: string, a: Side, b: Side) {
  const { guildId } = config;
  const updated = await prisma.matchmakingConfig.update({ where: { guildId }, data: { nextRoomNumber: { increment: 1 } } });
  const preset = await presetFor(guildId, game);
  const maps = preset?.useMaps ? stringList(preset.maps) : [];
  const everyone = [...a.players, ...b.players];
  await prisma.matchQueue.deleteMany({ where: { guildId, kind: { not: LFT }, userId: { in: [...everyone, a.captain, b.captain] } } });

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
  const parentId = config.activityChannelId ?? config.channelId;
  const parent = parentId ? await client.channels.fetch(parentId).catch(() => null) : null;
  if (!guild || parent?.type !== ChannelType.GuildText) return room;

  const title = `${a.name} vs ${b.name}`.slice(0, 100);
  const thread =
    (await parent.threads.create({ name: title, type: ChannelType.PrivateThread, invitable: false, autoArchiveDuration: 1440 }).catch(() => null)) ??
    (await parent.threads.create({ name: title, type: ChannelType.PublicThread, autoArchiveDuration: 1440 }).catch((err) => {
      logError("bot", err, guildId);
      return null;
    }));

  const texts = textsFor(config, game);
  const { voiceIds, pings: notes } = config.createVoice
    ? await openVoiceRooms({ guild, config, lobbyId: config.lobbyVoiceId, fallbackCategoryId: parent.parentId, game, map: room.map, number: room.number, a, b, shared: kind === "SOLO", texts })
    : { voiceIds: [], pings: [] };

  room = await prisma.matchRoom.update({ where: { id: room.id }, data: { threadId: thread?.id ?? null, voiceIds } });
  if (thread) {
    for (const id of everyone) await thread.members.add(id).catch(() => null);
    const card = await thread
      .send({ content: [mentionAll(everyone), ...notes].join("\n").slice(0, 2000), embeds: [roomEmbed(room, texts)], components: roomButtons(room, texts), allowedMentions: { parse: ["users"] } })
      .catch((err) => {
        logError("bot", err, guildId);
        return null;
      });
    if (card) room = await prisma.matchRoom.update({ where: { id: room.id }, data: { messageId: card.id } });
  }
  return room;
}

async function closeRoom(client: Client, room: MatchRoom, closing: string) {
  const config = await getConfig(room.guildId);
  await closeVoiceRooms(client, config, stringList(room.voiceIds), config?.lobbyVoiceId ?? null, room.guildId);
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
  await closeRoom(client, { ...done, voiceIds: room.voiceIds }, resolveText(textsFor(config, room.game), "roomWon", { winner, score: `${high}-${low}` }).text);
  await syncBoard(client, room.guildId, room.game);
  await syncMatchmakingPanel(client, room.guildId);
}

export async function cancelRoom(client: Client, roomId: string): Promise<boolean> {
  const room = await prisma.matchRoom.findUnique({ where: { id: roomId } });
  if (!room || !OPEN_ROOMS.includes(room.status)) return false;
  await lock(room.guildId)(async () => {
    const closed = await prisma.matchRoom.update({ where: { id: room.id }, data: { status: "CANCELED", voiceIds: [], expiresAt: null } });
    await closeRoom(client, { ...closed, voiceIds: room.voiceIds }, resolveText(textsFor(await getConfig(room.guildId), room.game), "roomCanceled").text);
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
  await interaction.editReply(gameMenu(games, action, kind, 0));
  return null;
}

// Discord menus hold 25 options, so longer lists page through in A to Z order.
const GAMES_PER_PAGE = 23;
function gameMenu(games: string[], action: string, kind: string, page: number): InteractionEditReplyOptions {
  const sorted = games.map((game, index) => ({ game, index })).sort((x, y) => x.game.localeCompare(y.game));
  const pages = Math.ceil(sorted.length / GAMES_PER_PAGE);
  const shown = sorted.slice(page * GAMES_PER_PAGE, (page + 1) * GAMES_PER_PAGE).map((g) => ({ label: g.game.slice(0, 100), value: String(g.index) }));
  const options = [...(page > 0 ? [{ label: "◀ Previous games", value: `page:${page - 1}` }] : []), ...shown, ...(page + 1 < pages ? [{ label: "More games ▶", value: `page:${page + 1}` }] : [])];
  const menu = new StringSelectMenuBuilder().setCustomId(`mmgame:${action}:${kind}`).setPlaceholder("Pick a game").addOptions(options);
  return { content: pages > 1 ? `Which game? Page ${page + 1} of ${pages}.` : "Which game?", components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)] };
}

const readyTeam = async (guildId: string, game: string, captainId: string) => {
  const team = await prisma.matchTeam.findFirst({ where: { guildId, game, captainId } });
  if (!team) return null;
  return team;
};

const sideOf = (team: MatchTeam): Side => ({ name: team.name, players: stringList(team.players), captain: team.captainId });

async function find(client: Client, config: MatchmakingConfig, kind: Kind, game: string, userId: string, guild: Interaction["guild"]): Promise<Reply> {
  const { guildId } = config;
  if (config.requireLobby && config.lobbyVoiceId) {
    const member = await guild?.members.fetch({ user: userId, force: true }).catch(() => null);
    if (member?.voice.channelId !== config.lobbyVoiceId) return `Join <#${config.lobbyVoiceId}> first, then tap Find a Match.`;
  }
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

function gameAction(client: Client, config: MatchmakingConfig, action: string, kind: Kind, game: string, userId: string, guild: Interaction["guild"]): Promise<Reply> {
  if (action === "find") return find(client, config, kind, game, userId, guild);
  if (action === "lft") return lookingForTeam(config.guildId, game, userId);
  if (action === "pickup") return pickup(config, game, userId, guild);
  return challengePicker(config, kind, game, userId);
}

// ---- Pickup matches ----
// Start Pickup Match walks through who's playing and how teams are made, then
// starts right away, even if the teams aren't full or are uneven.
// pool is everyone offered so far; players is who's ticked.
type PickupSetup = { game: string; pool: string[]; players: string[]; mode: "random" | "pick"; teamOne: string[] | null; names?: Record<string, string> };
const pendingPickups = new Map<string, PickupSetup>();
const pickupKey = (guildId: string, userId: string) => `${guildId}:${userId}`;

async function playersInMatches(guildId: string): Promise<Set<string>> {
  const rooms = await prisma.matchRoom.findMany({ where: { guildId, status: { in: OPEN_ROOMS } } });
  return new Set(rooms.flatMap((r) => [...stringList(r.aPlayers), ...stringList(r.bPlayers)]));
}

// Whoever is in the tapper's voice channel (or the lobby when they aren't in
// one), then the Looking for a Team list.
async function pickupDefaults(config: MatchmakingConfig, game: string, userId: string, guild: Interaction["guild"], size: number): Promise<string[]> {
  const member = await guild?.members.fetch({ user: userId, force: true }).catch(() => null);
  const voiceId = member?.voice.channelId ?? config.lobbyVoiceId;
  const voice = voiceId ? await guild?.channels.fetch(voiceId).catch(() => null) : null;
  const inVoice = voice?.isVoiceBased() ? [...voice.members.entries()].filter(([, m]) => !m.user?.bot).map(([id]) => id) : [];
  const waiting = await prisma.matchQueue.findMany({ where: { guildId: config.guildId, game, kind: LFT }, orderBy: { joinedAt: "asc" } });
  const playing = await playersInMatches(config.guildId);
  return [...new Set([userId, ...inVoice, ...waiting.map((q) => q.userId)])].filter((id) => !playing.has(id)).slice(0, size * 2);
}

function pickupScreen(index: number, setup: PickupSetup, size: number, note = ""): InteractionEditReplyOptions {
  const { players, mode, teamOne } = setup;
  const max = Math.min(25, size * 2);
  // A menu that opens with picks filled in draws name chips over the message
  // in Discord, so who's playing goes in the menu's placeholder instead.
  const nameList = (ids: string[]) => ids.map((id) => setup.names?.[id] ?? "Player").join(", ");
  const fit = (text: string) => (text.length > 150 ? `${text.slice(0, 149)}…` : text);
  const out = players.length
    ? [row(new StringSelectMenuBuilder().setCustomId(`mmpickwho:${index}`).setPlaceholder(fit(`Playing (${players.length}): ${nameList(players)}`)).setMinValues(1).setMaxValues(players.length)
        .addOptions(players.map((id) => ({ label: setup.names?.[id] ?? "Player", description: "Tap to take out", value: id }))))]
    : [];
  const add = new UserSelectMenuBuilder().setCustomId(`mmpickadd:${index}`).setPlaceholder("Add someone else").setMinValues(1).setMaxValues(Math.min(10, max));
  const how = new StringSelectMenuBuilder().setCustomId(`mmpickhow:${index}`).addOptions(
    { label: "Random teams", description: "Shuffle everyone into two even sides", value: "random", default: mode === "random" },
    { label: "I'll pick the teams", description: "Choose who's on Team 1, everyone else is Team 2", value: "pick", default: mode === "pick" },
  );
  const rows: Row[] = [...out, row(add), row(how)];
  const lines = [`⚡ **Pickup match · ${setup.game}** (up to ${size}v${size})`, `Players (${players.length}): ${players.length ? mentionAll(players) : "nobody yet"}`];
  if (mode === "pick" && players.length >= 2) {
    const chosen = (teamOne ?? []).filter((id) => players.includes(id));
    rows.push(row(new StringSelectMenuBuilder().setCustomId(`mmpickside:${index}`).setPlaceholder(fit(chosen.length ? `Team 1: ${nameList(chosen)}` : "Who's on Team 1?")).setMinValues(1).setMaxValues(players.length - 1)
      .addOptions(players.map((id) => ({ label: setup.names?.[id] ?? id, value: id })))));
    if (chosen.length) lines.push(`Team 1: ${mentionAll(chosen)}`, `Team 2: ${mentionAll(players.filter((id) => !chosen.includes(id)))}`);
  }
  rows.push(row(button(`mmpickgo:${index}`, "Start Match", ButtonStyle.Success)));
  lines.push("", "Take out anyone who isn't playing, add anyone missing, choose how teams are made, then tap **Start Match**.");
  if (note) lines.push("", note);
  return { content: lines.join("\n").slice(0, 2000), components: rows, allowedMentions: { parse: [] } };
}

async function pickup(config: MatchmakingConfig, game: string, userId: string, guild: Interaction["guild"]): Promise<Reply> {
  const busy = await openRoomFor(config.guildId, [userId]);
  if (busy) return inRoomMessage(busy);
  const size = teamSizeFor(await presetFor(config.guildId, game));
  const players = await pickupDefaults(config, game, userId, guild, size);
  const setup: PickupSetup = { game, pool: players, players, mode: "random", teamOne: null };
  await nameAll(setup, guild);
  pendingPickups.set(pickupKey(config.guildId, userId), setup);
  return pickupScreen(stringList(config.games).indexOf(game), setup, size);
}

async function nameAll(setup: PickupSetup, guild: Interaction["guild"]) {
  const ids = [...new Set([...setup.pool, ...setup.players])];
  const names = await Promise.all(ids.map((id) => guild?.members.fetch(id).catch(() => null)));
  setup.names = Object.fromEntries(ids.map((id, i) => [id, (names[i]?.displayName ?? "Player").slice(0, 100)]));
}

async function startPickup(client: Client, config: MatchmakingConfig, setup: PickupSetup, guild: Interaction["guild"]): Promise<string> {
  const { guildId } = config;
  const size = teamSizeFor(await presetFor(guildId, setup.game));
  const playing = await playersInMatches(guildId);
  const busy = setup.players.filter((id) => playing.has(id));
  if (busy.length) return `${mentionAll(busy)} ${busy.length === 1 ? "is" : "are"} already in a match. Take them out of the players first.`;
  if (setup.players.length < 2) return "Pick at least 2 players.";
  if (setup.players.length > size * 2) return `That's too many for ${setup.game}. Pick up to ${size * 2} players.`;

  let one: string[], two: string[];
  if (setup.mode === "pick") {
    one = (setup.teamOne ?? []).filter((id) => setup.players.includes(id));
    two = setup.players.filter((id) => !one.includes(id));
    if (!one.length || !two.length) return "Pick who's on Team 1 first. Everyone else goes on Team 2.";
  } else {
    const mixed = shuffle(setup.players);
    one = mixed.slice(0, Math.ceil(mixed.length / 2));
    two = mixed.slice(one.length);
  }
  await nameAll(setup, guild);
  const side = (ids: string[]): Side => ({ name: `Team ${setup.names?.[ids[0]] ?? "Player"}`.slice(0, 80), players: ids, captain: ids[0] });
  const a = side(one);
  const b = side(two);
  if (a.name === b.name) b.name = `${b.name} 2`;
  await prisma.matchQueue.deleteMany({ where: { guildId, game: setup.game, kind: LFT, userId: { in: setup.players } } });
  const room = await openRoom(client, config, "PICKUP", setup.game, a, b);
  return `⚡ Pickup match started, ${one.length}v${two.length}: ${room.threadId ? `<#${room.threadId}>` : "your match"}`;
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
  const channelId = config.activityChannelId ?? config.channelId;
  const channel = channelId ? await client.channels.fetch(channelId).catch(() => null) : null;
  if (!isSendableChannel(channel)) return "The Matchmaking channel isn't available.";
  const challenge = await prisma.matchChallenge.create({ data: { ...data, guildId, expiresAt: new Date(Date.now() + challengeMinutes * 60_000) } });
  const message = await channel
    .send({
      content: resolveText(textsFor(config, data.game), "challenge", { target: `<@${data.toId}>`, from: data.fromTeam ? `**${data.fromTeam}**` : `<@${data.fromId}>`, game: data.game, expires: `<t:${Math.floor(challenge.expiresAt.getTime() / 1000)}:R>` }).text,
      components: [row(button(`mmans:${challenge.id}:accept`, resolveText(textsFor(config, data.game), "btnAccept").text, ButtonStyle.Success), button(`mmans:${challenge.id}:decline`, resolveText(textsFor(config, data.game), "btnDecline").text, ButtonStyle.Danger))],
      allowedMentions: { users: [data.toId] },
    })
    .catch(() => null);
  if (message) await prisma.matchChallenge.update({ where: { id: challenge.id }, data: { messageId: message.id } });
  return `Challenge sent. It expires in ${challengeMinutes} minutes.`;
}

async function dropChallenge(client: Client, challenge: MatchChallenge, config: MatchmakingConfig | null) {
  await prisma.matchChallenge.delete({ where: { id: challenge.id } }).catch(() => null);
  const channelId = config?.activityChannelId ?? config?.channelId;
  if (!challenge.messageId || !channelId) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
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
  if (teams.length === 0) return "You aren't on a team yet. Tap Create a Team, or Looking for a Team so captains can add you.";
  const lines = teams.map((t) => `**${t.name}** (${t.game})${t.captainId === userId ? " 👑" : ""}: ${mentionAll(stringList(t.players))}`).join("\n").slice(0, 1900);
  const owned = teams.filter((t) => t.captainId === userId).slice(0, 25);
  const joined = teams.filter((t) => t.captainId !== userId).slice(0, 25);
  const menus: Row[] = [];
  if (owned.length) menus.push(row(new StringSelectMenuBuilder().setCustomId("mmmanage:pick").setPlaceholder("Manage a team you captain").addOptions(owned.map((t) => ({ label: t.name.slice(0, 100), description: t.game.slice(0, 100), value: t.id })))));
  if (joined.length) menus.push(row(new StringSelectMenuBuilder().setCustomId("mmleaveteam:pick").setPlaceholder("Leave a team").addOptions(joined.map((t) => ({ label: t.name.slice(0, 100), description: t.game.slice(0, 100), value: t.id })))));
  return { content: lines, components: menus, allowedMentions: { parse: [] } };
}

// What a captain sees after picking one of their teams.
async function teamManager(team: MatchTeam): Promise<InteractionEditReplyOptions> {
  const size = teamSizeFor(await presetFor(team.guildId, team.game));
  const players = stringList(team.players);
  const open = Math.max(0, size - players.length);
  const waiting = await prisma.matchQueue.count({ where: { guildId: team.guildId, game: team.game, kind: LFT } });
  const buttons = [
    button(`mm:rename:${team.id}`, "Rename", ButtonStyle.Secondary),
    button(`mm:roster:${team.id}`, "Change Players", ButtonStyle.Primary),
    ...(open > 0 && waiting > 0 ? [button(`mm:recruit:${team.id}`, `Add from Looking for a Team (${waiting})`, ButtonStyle.Success)] : []),
    ...(open > 0 ? [button(`mm:invite:${team.id}`, "Invite Players", ButtonStyle.Success)] : []),
    button(`mm:disband:${team.id}`, "Disband", ButtonStyle.Danger),
  ];
  return {
    content: [`**${team.name}** · ${team.game} (${players.length}/${size})`, mentionAll(players), open > 0 ? `${open} spot${open === 1 ? "" : "s"} open. The team can queue once it's full.` : "Full and ready to queue."].join("\n"),
    components: [row(...buttons)],
    allowedMentions: { parse: [] },
  };
}

function invitePicker(team: MatchTeam, open: number): InteractionEditReplyOptions {
  const menu = new UserSelectMenuBuilder().setCustomId(`mminvitepick:${team.id}`).setPlaceholder("Pick players to invite").setMinValues(1).setMaxValues(Math.max(1, open));
  return {
    content: `Who do you want to invite to ${team.name}? ${open} spot${open === 1 ? "" : "s"} open. Each player gets a message to accept or decline.`,
    components: [new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(menu)],
  };
}

// Sends each invite as a DM with its own Accept and Decline. Only the invitee
// receives the message, so whoever presses its buttons is the person invited.
async function sendInvites(client: Client, guild: Interaction["guild"], team: MatchTeam, captainName: string, userIds: string[]): Promise<string> {
  const players = stringList(team.players);
  const expires = Math.floor(Date.now() / 1000) + INVITE_HOURS * 3600;
  const sent: string[] = [], closed: string[] = [], skipped: string[] = [];
  for (const id of userIds) {
    if (players.includes(id)) { skipped.push(id); continue; }
    const target = await client.users.fetch(id).catch(() => null);
    const ok = await target
      ?.send({
        content: `🛡️ **${captainName}** invited you to join **${team.name}** for ${team.game} in **${guild?.name ?? "the server"}**. This invite lasts ${INVITE_HOURS} hours.`,
        components: [row(button(`mminvite:${team.id}:${expires}:accept`, "Accept", ButtonStyle.Success), button(`mminvite:${team.id}:${expires}:decline`, "Decline", ButtonStyle.Danger))],
      })
      .then(() => true, () => false);
    (ok ? sent : closed).push(id);
  }
  return [
    sent.length ? `📨 Invited ${mentionAll(sent)}. You'll get a message when they answer.` : "",
    closed.length ? `Couldn't message ${mentionAll(closed)}. Their DMs are closed, so add them with Change Players instead.` : "",
    skipped.length ? `Already on the team: ${mentionAll(skipped)}.` : "",
  ].filter(Boolean).join("\n") || "Nobody was invited.";
}

// Accept or Decline on an invite DM. These arrive outside the server, so they
// skip the server-only checks the board's buttons go through.
export async function handleTeamInvite(interaction: ButtonInteraction) {
  const [, teamId, expires, answer] = interaction.customId.split(":");
  const { client, user } = interaction;
  const done = (content: string) => interaction.update({ content, components: [] }).catch(() => interaction.reply({ content, ephemeral: true }).catch(() => null));
  try {
    if (Number(expires) * 1000 < Date.now()) return void (await done("This invite has expired. Ask the captain to send a new one."));
    const team = await prisma.matchTeam.findUnique({ where: { id: teamId } });
    if (!team) return void (await done("That team no longer exists."));
    if (!(await isModuleEnabled(team.guildId, "MATCHES"))) return void (await done("Matchmaking is turned off in that server right now."));
    const tell = async (text: string) => {
      const captain = await client.users.fetch(team.captainId).catch(() => null);
      await captain?.send(text).catch(() => null);
    };

    if (answer === "decline") {
      await done(`You declined the invite to **${team.name}**.`);
      await tell(`<@${user.id}> declined your invite to **${team.name}**.`);
      return;
    }

    const guild = await client.guilds.fetch(team.guildId).catch(() => null);
    const member = await guild?.members.fetch(user.id).catch(() => null);
    if (!member) return void (await done("You need to be in that server to join the team."));
    const result = await lock(team.guildId)(async () => {
      const fresh = await prisma.matchTeam.findUnique({ where: { id: team.id } });
      if (!fresh) return "That team no longer exists.";
      const players = stringList(fresh.players);
      if (players.includes(user.id)) return `You're already on **${fresh.name}**.`;
      if (players.length >= teamSizeFor(await presetFor(fresh.guildId, fresh.game))) return `**${fresh.name}** is full now.`;
      const blocked = await teamBusy(fresh);
      if (blocked) return `${blocked} Tap Accept again once it's over.`;
      await saveRoster(fresh, [...players, user.id]);
      return null;
    });
    if (result) {
      if (result.endsWith("once it's over.")) return void (await interaction.reply({ content: result, ephemeral: true }).catch(() => null));
      return void (await done(result));
    }
    await done(`✅ You joined **${team.name}** for ${team.game}. Tap My Teams on the Matchmaking board to see it.`);
    await tell(`<@${user.id}> accepted your invite and joined **${team.name}**.`);
    await syncMatchmakingPanel(client, team.guildId);
  } catch (err) {
    logError("bot", err);
    await interaction.reply({ content: failed, ephemeral: true }).catch(() => null);
  }
}

async function ownTeam(guildId: string, teamId: string, userId: string): Promise<MatchTeam | string> {
  const team = await prisma.matchTeam.findUnique({ where: { id: teamId } });
  if (!team || team.guildId !== guildId) return "That team no longer exists.";
  if (team.captainId !== userId) return "Only the team's captain can do that.";
  return team;
}

// Changing players mid-match would change who the room thinks is playing.
async function teamBusy(team: MatchTeam): Promise<string | null> {
  const room = await openRoomFor(team.guildId, stringList(team.players));
  return room ? `${team.name} has a match going. Finish it first.` : null;
}

async function saveRoster(team: MatchTeam, players: string[]) {
  await prisma.matchTeam.update({ where: { id: team.id }, data: { players } });
  // The queued roster is out of date, and new players are no longer looking.
  await prisma.matchQueue.deleteMany({ where: { teamId: team.id } });
  await prisma.matchQueue.deleteMany({ where: { guildId: team.guildId, game: team.game, kind: LFT, userId: { in: players } } });
}

async function lookingForTeam(guildId: string, game: string, userId: string): Promise<string> {
  const onTeam = (await prisma.matchTeam.findMany({ where: { guildId, game } })).find((t) => stringList(t.players).includes(userId));
  if (onTeam) return `You're already on **${onTeam.name}** for ${game}. Tap My Teams to see it.`;
  const where = { guildId_game_kind_userId: { guildId, game, kind: LFT, userId } };
  if (await prisma.matchQueue.findUnique({ where })) {
    await prisma.matchQueue.delete({ where });
    return `You're off the Looking for a Team list for ${game}.`;
  }
  await prisma.matchQueue.create({ data: { guildId, game, kind: LFT, userId } });
  return `You're on the Looking for a Team list for ${game}. Captains can add you from My Teams, or anyone waiting can tap Start Pickup Match to play now. Tap the button again to come off it.`;
}

async function recruitPicker(guild: Interaction["guild"], team: MatchTeam): Promise<Reply> {
  const size = teamSizeFor(await presetFor(team.guildId, team.game));
  const open = size - stringList(team.players).length;
  if (open <= 0) return `${team.name} is already full.`;
  const waiting = await prisma.matchQueue.findMany({ where: { guildId: team.guildId, game: team.game, kind: LFT }, orderBy: { joinedAt: "asc" }, take: 25 });
  if (waiting.length === 0) return `Nobody is looking for a ${team.game} team right now.`;
  const names = await Promise.all(waiting.map((q) => guild?.members.fetch(q.userId).catch(() => null)));
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`mmrecruit:${team.id}`)
    .setPlaceholder("Pick players to add")
    .setMinValues(1)
    .setMaxValues(Math.min(open, waiting.length))
    .addOptions(waiting.map((q, i) => ({ label: (names[i]?.displayName ?? "Player").slice(0, 100), value: q.userId })));
  return { content: `Who do you want on ${team.name}? ${open} spot${open === 1 ? "" : "s"} open.`, components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)] };
}

async function teamNameModal(interaction: ButtonInteraction | StringSelectMenuInteraction, index: number) {
  const field = new TextInputBuilder().setCustomId("name").setLabel("Team name").setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(32).setRequired(true);
  await interaction.showModal(new ModalBuilder().setCustomId(`mmteamname:${index}`).setTitle("Create a Team").addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(field)));
}

async function renameModal(interaction: ButtonInteraction, team: MatchTeam) {
  const field = new TextInputBuilder().setCustomId("name").setLabel("New team name").setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(32).setValue(team.name).setRequired(true);
  await interaction.showModal(new ModalBuilder().setCustomId(`mmrename:${team.id}`).setTitle(`Rename ${team.name}`.slice(0, 45)).addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(field)));
}

// Teams can start short and fill up later, so any number up to the size is fine.
// Discord only sends a multi-pick menu once it's closed, which is easy to
// miss, so picks show here first and nothing changes until Save Players.
const pendingMates = new Map<string, string[]>();
const pendingKey = (teamId: string, userId: string) => `${teamId}:${userId}`;

function matesPicker(team: MatchTeam, size: number, picked?: string[]): InteractionEditReplyOptions {
  const current = picked ?? stringList(team.players).filter((id) => id !== team.captainId);
  const menu = new UserSelectMenuBuilder().setCustomId(`mmmates:${team.id}`).setPlaceholder("Pick your teammates").setMinValues(0).setMaxValues(size - 1);
  if (current.length) menu.setDefaultUsers(current.slice(0, size - 1));
  const intro = `Pick up to ${size - 1} teammate${size === 2 ? "" : "s"} for ${team.name}, then tap **Save Players**. You can leave spots open and fill them later.`;
  return {
    content: picked ? `${intro}\n\nSelected: ${picked.length ? mentionAll(picked) : "nobody (just you)"}. Tap **Save Players** to keep this.` : intro,
    components: [new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(menu), row(button(`mmmatesave:${team.id}`, "Save Players", ButtonStyle.Success))],
    allowedMentions: { parse: [] },
  };
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
      if (action === "rename") {
        const team = await ownTeam(guildId, arg, user.id);
        if (typeof team === "string") return void (await interaction.reply({ content: team, ephemeral: true }));
        return void (await renameModal(interaction, team));
      }
      await interaction.deferReply({ ephemeral: true });
      if (action === "find" || action === "challenge" || action === "newteam" || action === "lft" || action === "pickup") {
        const game = await chooseGame(interaction, config, action, arg ?? "");
        if (!game) return;
        await reply(interaction, await run(() => gameAction(client, config, action, arg as Kind, game, user.id, interaction.guild)));
      } else if (action === "leave") {
        await run(() => prisma.matchQueue.deleteMany({ where: { guildId, userId: user.id, kind: arg } }));
        await reply(interaction, "You left the queue.");
      } else if (action === "myteam") {
        await reply(interaction, await myTeams(guildId, user.id));
      } else if (action === "disband") {
        const team = await ownTeam(guildId, arg, user.id);
        await reply(interaction, typeof team === "string" ? team : { content: `Disband **${team.name}**? Everyone comes off the team. Its leaderboard record stays.`, components: [row(button(`mm:disbandyes:${team.id}`, `Disband ${team.name}`, ButtonStyle.Danger))] });
      } else if (action === "disbandyes") {
        const value = await run(async () => {
          const team = await ownTeam(guildId, arg, user.id);
          if (typeof team === "string") return team;
          await prisma.matchQueue.deleteMany({ where: { teamId: team.id } });
          await prisma.matchTeam.delete({ where: { id: team.id } });
          return `${team.name} was disbanded. Its leaderboard record stays.`;
        });
        await reply(interaction, value);
      } else if (action === "invite") {
        const team = await ownTeam(guildId, arg, user.id);
        if (typeof team === "string") return void (await reply(interaction, team));
        const open = teamSizeFor(await presetFor(guildId, team.game)) - stringList(team.players).length;
        await reply(interaction, open > 0 ? invitePicker(team, open) : `${team.name} is already full.`);
        return;
      } else if (action === "roster" || action === "recruit") {
        const team = await ownTeam(guildId, arg, user.id);
        const blocked = typeof team === "string" ? team : await teamBusy(team);
        if (blocked || typeof team === "string") return void (await reply(interaction, blocked ?? "That team no longer exists."));
        await reply(interaction, action === "roster" ? matesPicker(team, teamSizeFor(await presetFor(guildId, team.game))) : await recruitPicker(interaction.guild, team));
        return;
      }
      await syncMatchmakingPanel(client, guildId);
      return;
    }

    if (prefix === "mmgame" && interaction.isStringSelectMenu()) {
      const [, action, kind] = parts;
      const picked = interaction.values[0];
      if (picked.startsWith("page:")) {
        await interaction.deferUpdate();
        return void (await reply(interaction, gameMenu(games, action, kind, Number(picked.slice(5)))));
      }
      const game = games[Number(picked)];
      if (action === "newteam") return void (await teamNameModal(interaction, Number(interaction.values[0])));
      await interaction.deferUpdate();
      await reply(interaction, await run(() => gameAction(client, config, action, kind as Kind, game, user.id, interaction.guild)));
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

    if (prefix === "mmmanage" && interaction.isStringSelectMenu()) {
      await interaction.deferUpdate();
      const team = await ownTeam(guildId, interaction.values[0], user.id);
      await reply(interaction, typeof team === "string" ? team : await teamManager(team));
      return;
    }

    if (prefix === "mmleaveteam" && interaction.isStringSelectMenu()) {
      await interaction.deferUpdate();
      const value = await run(async () => {
        const team = await prisma.matchTeam.findUnique({ where: { id: interaction.values[0] } });
        if (!team || team.guildId !== guildId || !stringList(team.players).includes(user.id)) return "You aren't on that team.";
        if (team.captainId === user.id) return "Captains can't leave their own team. Disband it from My Teams instead.";
        const blocked = await teamBusy(team);
        if (blocked) return blocked;
        await saveRoster(team, stringList(team.players).filter((id) => id !== user.id));
        return `You left ${team.name}.`;
      });
      await reply(interaction, value);
      await syncMatchmakingPanel(client, guildId);
      return;
    }

    if (prefix === "mminvitepick" && interaction.isUserSelectMenu()) {
      await interaction.deferUpdate();
      const team = await ownTeam(guildId, parts[1], user.id);
      if (typeof team === "string") return void (await reply(interaction, team));
      const picked = interaction.users.filter((u) => !u.bot && u.id !== user.id).map((u) => u.id);
      if (picked.length === 0) return void (await reply(interaction, "Pick someone other than yourself."));
      await reply(interaction, { content: await sendInvites(client, interaction.guild, team, member?.displayName ?? user.username, picked), components: [], allowedMentions: { parse: [] } });
      return;
    }

    if (prefix.startsWith("mmpick") && prefix !== "mmpickgo") {
      await interaction.deferUpdate();
      const setup = pendingPickups.get(pickupKey(guildId, user.id));
      if (!setup) return void (await reply(interaction, "This setup timed out. Tap Start Pickup Match again."));
      const size = teamSizeFor(await presetFor(guildId, setup.game));
      if (prefix === "mmpickwho" && interaction.isStringSelectMenu()) {
        setup.players = setup.players.filter((id) => !interaction.values.includes(id));
      } else if (prefix === "mmpickadd" && interaction.isUserSelectMenu()) {
        const added = [...interaction.users.filter((u) => !u.bot).keys()];
        setup.pool = [...new Set([...setup.pool, ...added])].slice(-25);
        setup.players = setup.pool.filter((id) => setup.players.includes(id) || added.includes(id)).slice(0, size * 2);
        await nameAll(setup, interaction.guild);
      } else if (prefix === "mmpickhow" && interaction.isStringSelectMenu()) {
        setup.mode = interaction.values[0] === "pick" ? "pick" : "random";
      } else if (prefix === "mmpickside" && interaction.isStringSelectMenu()) {
        setup.teamOne = interaction.values;
      }
      await reply(interaction, pickupScreen(Number(parts[1]), setup, size));
      return;
    }

    if (prefix === "mmpickgo" && interaction.isButton()) {
      await interaction.deferUpdate();
      const key = pickupKey(guildId, user.id);
      const setup = pendingPickups.get(key);
      if (!setup) return void (await reply(interaction, "This setup timed out. Tap Start Pickup Match again."));
      const result = await run(() => startPickup(client, config, setup, interaction.guild));
      if (!result.startsWith("⚡")) return void (await reply(interaction, pickupScreen(Number(parts[1]), setup, teamSizeFor(await presetFor(guildId, setup.game)), result)));
      pendingPickups.delete(key);
      await reply(interaction, { content: result, components: [] });
      await syncMatchmakingPanel(client, guildId);
      return;
    }

    if (prefix === "mmrecruit" && interaction.isStringSelectMenu()) {
      await interaction.deferUpdate();
      const value = await run(async () => {
        const team = await ownTeam(guildId, parts[1], user.id);
        if (typeof team === "string") return team;
        const blocked = await teamBusy(team);
        if (blocked) return blocked;
        const size = teamSizeFor(await presetFor(guildId, team.game));
        const still = await prisma.matchQueue.findMany({ where: { guildId, game: team.game, kind: LFT, userId: { in: interaction.values } } });
        const adding = still.map((q) => q.userId).slice(0, size - stringList(team.players).length);
        if (adding.length === 0) return "Those players are no longer looking for a team.";
        await saveRoster(team, [...stringList(team.players), ...adding]);
        for (const id of adding) {
          const added = await client.users.fetch(id).catch(() => null);
          await added?.send(`You were added to **${team.name}** for ${team.game} in **${interaction.guild?.name ?? "the server"}**. Tap My Teams on the Matchmaking board to see it.`).catch(() => null);
        }
        return teamManager((await prisma.matchTeam.findUnique({ where: { id: team.id } })) ?? team);
      });
      await reply(interaction, value);
      await syncMatchmakingPanel(client, guildId);
      return;
    }

    if (prefix === "mmrename" && interaction.isModalSubmit()) {
      await interaction.deferReply({ ephemeral: true });
      const name = cleanTeamName(interaction.fields.getTextInputValue("name"));
      if (name.length < 2) return void (await reply(interaction, "Use at least 2 letters or numbers."));
      await reply(
        interaction,
        await run(async () => {
          const team = await ownTeam(guildId, parts[1], user.id);
          if (typeof team === "string") return team;
          const blocked = await teamBusy(team);
          if (blocked) return blocked;
          const taken = await prisma.matchTeam.findFirst({ where: { guildId, game: team.game, name: { equals: name, mode: "insensitive" }, id: { not: team.id } } });
          if (taken) return "Another team already has that name.";
          await prisma.matchTeam.update({ where: { id: team.id }, data: { name } });
          return `Renamed to **${name}**. Past results stay under the old name on the leaderboard.`;
        })
      );
      await syncMatchmakingPanel(client, guildId);
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
          await prisma.matchQueue.deleteMany({ where: { guildId, game, kind: LFT, userId: user.id } });
          return matesPicker(team, teamSizeFor(await presetFor(guildId, game)));
        })
      );
      await syncMatchmakingPanel(client, guildId);
      return;
    }

    if (prefix === "mmmates" && interaction.isUserSelectMenu()) {
      await interaction.deferUpdate();
      const team = await ownTeam(guildId, parts[1], user.id);
      if (typeof team === "string") return void (await reply(interaction, team));
      const size = teamSizeFor(await presetFor(guildId, team.game));
      const picked = interaction.users.filter((u) => !u.bot && u.id !== user.id).map((u) => u.id).slice(0, size - 1);
      pendingMates.set(pendingKey(team.id, user.id), picked);
      await reply(interaction, matesPicker(team, size, picked));
      return;
    }

    if (prefix === "mmmatesave" && interaction.isButton()) {
      await interaction.deferUpdate();
      const value = await run(async () => {
        const team = await ownTeam(guildId, parts[1], user.id);
        if (typeof team === "string") return team;
        const blocked = await teamBusy(team);
        if (blocked) return blocked;
        const size = teamSizeFor(await presetFor(guildId, team.game));
        const mates = pendingMates.get(pendingKey(team.id, user.id));
        if (!mates) {
          const unchanged = matesPicker(team, size);
          return { ...unchanged, content: `${unchanged.content}\n\nPick players in the menu first, close it, then tap **Save Players**.` };
        }
        pendingMates.delete(pendingKey(team.id, user.id));
        await saveRoster(team, [user.id, ...mates]);
        const open = size - 1 - mates.length;
        return {
          content: open > 0 ? `**${team.name}** saved with ${mates.length + 1} of ${size}. Fill the last ${open} from My Teams.` : `**${team.name}** is ready for ${team.game}: ${mentionAll([user.id, ...mates])}`,
          components: [],
          allowedMentions: { parse: [] },
        };
      });
      await reply(interaction, value);
      await syncMatchmakingPanel(client, guildId);
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
            await closeRoom(client, { ...closed, voiceIds: fresh.voiceIds }, resolveText(textsFor(config, fresh.game), "roomCanceled").text);
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

const refreshedBoards = new Set<string>();

export async function tickMatchmaking(client: Client) {
  const now = new Date();
  // After a restart, posts catch up to any change in how they look.
  const boards = await prisma.matchmakingConfig.findMany({ where: { boardChannelId: { not: null } }, select: { guildId: true } });
  for (const { guildId } of boards) {
    if (refreshedBoards.has(guildId)) continue;
    refreshedBoards.add(guildId);
    await syncBoard(client, guildId).catch((err) => logError("bot", err, guildId));
  }

  const configs = await prisma.matchmakingConfig.findMany({ where: { enabled: true } });
  for (const config of configs) {
    const { guildId } = config;
    if (!config.messageId || !sweptGuilds.has(guildId)) await syncMatchmakingPanel(client, guildId).catch((err) => logError("bot", err, guildId));
    const stale = await prisma.matchQueue.deleteMany({ where: { guildId, kind: { not: LFT }, joinedAt: { lte: new Date(now.getTime() - config.queueMinutes * 60_000) } } });
    const staleLft = await prisma.matchQueue.deleteMany({ where: { guildId, kind: LFT, joinedAt: { lte: new Date(now.getTime() - LFT_HOURS * 3_600_000) } } });
    if (stale.count || staleLft.count) await syncMatchmakingPanel(client, guildId).catch((err) => logError("bot", err, guildId));
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
