import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventStatus,
  ChatInputCommandInteraction,
  Client,
  GuildMember,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type InteractionEditReplyOptions,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { Prisma, type MatchPlayer, type MatchSession, type MatchSetup } from "@prisma/client";
import { rankGroups, resolveText, textsForGame, type TextOverrides } from "@spartacus/shared";
import { logError } from "@spartacus/db";
import { prisma } from "../../lib/prisma";
import { isSendableChannel } from "../../lib/channels";
import { isModuleEnabled } from "../../lib/moduleGate";
import { addBalance, getConfig } from "../../lib/economy";
import { awardAchievement } from "../../lib/achievements";
import {
  bracketTeamCount,
  fitBracket,
  buildBracket,
  currentTeams,
  draftSide,
  emptyState,
  mapPool,
  nextTie,
  countsAsNamedTeam,
  onTeam,
  teamSlotName,
  cleanTeamName,
  replacePlayer,
  pickCaptain,
  pickOne,
  ratingChange,
  ratingFromRank,
  recordTie,
  shuffle,
  splitTeams,
  tallyVotes,
  type MatchReport,
  type MatchState,
  type MatchTeam,
  type Side,
} from "./engine";
import { buildBracket as bracketEmbed, buildLeaderboard, buildPanel, buildResult, buildRosters, buildStats, stringList, type PlayerMap } from "./render";
import { closeVoiceRooms, openVoiceRooms } from "./voice";
import { syncBoard } from "./leaderboard";
import { withLock } from "./lock";
import { syncMatchmakingPanel, tickMatchmaking } from "./matchmaking";

const CONFIRM_MS = 5 * 60_000;
const DONE_RESET_MS = 30 * 60_000;
const POST_ERROR_GAP_MS = 10 * 60_000;
const REMINDER_GRACE_MS = 15 * 60_000;
const ACTIVE_PHASES = ["TEAMS", "MAP", "LIVE"];
const fromNow = (ms: number) => (ms > 0 ? new Date(Date.now() + ms) : null);
const lastPostError = new Map<string, number>();

type Reply = string | InteractionEditReplyOptions | null;

interface Ctx {
  texts: unknown; // the Messages tab's custom wording
  client: Client;
  setup: MatchSetup;
  session: MatchSession;
  state: MatchState;
}

const readState = (session: MatchSession): MatchState => ({ ...emptyState(), ...(session.state as unknown as Partial<MatchState>) });

async function openSession(setup: MatchSetup, signups: string[] = []): Promise<MatchSession> {
  const updated = await prisma.matchSetup.update({ where: { id: setup.id }, data: { nextMatchNumber: { increment: 1 } } });
  return prisma.matchSession.create({
    data: {
      setupId: setup.id,
      guildId: setup.guildId,
      number: updated.nextMatchNumber - 1,
      kind: setup.format,
      phase: "SIGNUP",
      state: emptyState(signups) as unknown as Prisma.InputJsonValue,
      phaseEndsAt: signups.length || setup.startMode === "SCHEDULED" ? signupDeadline(setup) : null,
    },
  });
}

async function loadCtx(client: Client, setupId: string): Promise<Ctx | null> {
  const setup = await prisma.matchSetup.findUnique({ where: { id: setupId } });
  if (!setup) return null;
  let session = await prisma.matchSession.findFirst({ where: { setupId, closedAt: null }, orderBy: { createdAt: "desc" } });
  // Switching a setup between formats only takes over once nothing is running.
  if (session && session.kind !== setup.format && (session.phase === "SIGNUP" || session.phase === "DONE")) {
    await prisma.matchSession.update({ where: { id: session.id }, data: { closedAt: new Date() } });
    session = null;
  }
  session ??= await openSession(setup);
  const config = await prisma.matchmakingConfig.findUnique({ where: { guildId: setup.guildId } });
  return { client, setup, session, state: readState(session), texts: textsForGame(config?.texts, config?.gameTexts, setup.game) };
}

// Scheduled setups run off their start time. Otherwise sign-ups only have a
// deadline when timers are on.
function signupDeadline(setup: MatchSetup): Date | null {
  if (setup.startMode === "SCHEDULED") return setup.startAt && setup.startAt > new Date() ? setup.startAt : null;
  return setup.useTimers ? fromNow(setup.signupMinutes * 60_000) : null;
}
const usesPicks = (setup: MatchSetup) => setup.joinMode === "PICK" && setup.teamSize > 1;
const slotCount = (setup: MatchSetup, kind: string) => (kind === "TOURNAMENT" ? setup.tournamentTeams : 2);
const slotName = (setup: MatchSetup, kind: string, slot: number) => teamSlotName(stringList(setup.teamNames), kind === "TOURNAMENT", slot, setup.team1Name, setup.team2Name);

async function fetchPlayers(setup: MatchSetup, ids: string[]): Promise<PlayerMap> {
  const rows = await prisma.matchPlayer.findMany({ where: { setupId: setup.id, userId: { in: ids } } });
  return Object.fromEntries(rows.map((p) => [p.userId, p]));
}

async function ratingsFor(setup: MatchSetup, ids: string[]): Promise<Record<string, number>> {
  const players = await fetchPlayers(setup, ids);
  return Object.fromEntries(ids.map((id) => [id, players[id]?.rating ?? 1000]));
}

async function save(ctx: Ctx, phase: string, endsAt: Date | null = null) {
  ctx.session = await prisma.matchSession.update({
    where: { id: ctx.session.id },
    data: { phase, phaseEndsAt: endsAt, doneAt: phase === "DONE" ? new Date() : null, state: ctx.state as unknown as Prisma.InputJsonValue },
  });
  await syncPanel(ctx);
}

// Menu options can't show mentions, so the draft needs real names.
async function draftNames(client: Client, setup: MatchSetup, state: MatchState): Promise<Record<string, string>> {
  if (state.draftPool.length === 0) return {};
  const guild = await client.guilds.fetch(setup.guildId).catch(() => null);
  const members = await Promise.all(state.draftPool.map((id) => guild?.members.fetch(id).catch(() => null)));
  return Object.fromEntries(state.draftPool.map((id, i) => [id, members[i]?.displayName ?? "Unknown player"]));
}

async function syncPanel(ctx: Ctx) {
  const { client, setup, session, state } = ctx;
  const channel = await client.channels.fetch(setup.panelChannelId).catch(() => null);
  if (!isSendableChannel(channel)) return;
  if (!state.eventId && session.phase !== "DONE") await createEvent(ctx);
  const ids = [...new Set([...state.signups, ...state.teams.flatMap((t) => t.players), ...state.draftPool])];
  const payload = buildPanel(setup, session.kind, session.number, session.phase, session.phaseEndsAt, state, await fetchPlayers(setup, ids), await draftNames(client, setup, state), ctx.texts);

  if (setup.panelMessageId) {
    const message = await channel.messages.fetch(setup.panelMessageId).catch(() => null);
    const edited = await message?.edit(payload).catch((err) => {
      logError("bot", err, setup.guildId);
      return null;
    });
    if (edited) return;
  }
  const sent = await channel.send({ ...payload, content: undefined, allowedMentions: { parse: [] } }).catch((err) => {
    // The timer retries every few seconds, so a missing permission shouldn't
    // fill the Errors page with the same failure.
    if (Date.now() - (lastPostError.get(setup.id) ?? 0) > POST_ERROR_GAP_MS) {
      lastPostError.set(setup.id, Date.now());
      logError("bot", err, setup.guildId);
    }
    return null;
  });
  if (sent) {
    setup.panelMessageId = sent.id;
    await prisma.matchSetup.update({ where: { id: setup.id }, data: { panelMessageId: sent.id } });
  }
}

// Discord events need a start time, so one with no schedule is listed an hour
// ahead and updated when it actually begins.
const EVENT_LEAD_MS = 60 * 60_000;
const EVENT_LENGTH_MS = 2 * 60 * 60_000;

async function createEvent(ctx: Ctx) {
  const { client, setup, session, state } = ctx;
  const guild = await client.guilds.fetch(setup.guildId).catch(() => null);
  if (!guild) return;
  const start = setup.startMode === "SCHEDULED" && setup.startAt && setup.startAt > new Date() ? setup.startAt : new Date(Date.now() + EVENT_LEAD_MS);
  const voice = setup.lobbyVoiceId ? await guild.channels.fetch(setup.lobbyVoiceId).catch(() => null) : null;
  const details = `${session.kind === "TOURNAMENT" ? "Tournament" : setup.teamSize === 1 ? "1v1" : "Team match"} · ${setup.game}. Sign up in the panel channel.`;
  const name = (session.kind === "TOURNAMENT" ? setup.name : `${setup.name} #${session.number}`).slice(0, 100);
  const event = await guild.scheduledEvents
    .create(
      voice?.isVoiceBased()
        ? { name, description: details, scheduledStartTime: start, privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly, entityType: GuildScheduledEventEntityType.Voice, channel: voice.id }
        : { name, description: details, scheduledStartTime: start, scheduledEndTime: new Date(start.getTime() + EVENT_LENGTH_MS), privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly, entityType: GuildScheduledEventEntityType.External, entityMetadata: { location: "Discord" } }
    )
    .catch((err) => {
      if (Date.now() - (lastPostError.get(`event:${setup.id}`) ?? 0) > POST_ERROR_GAP_MS) {
        lastPostError.set(`event:${setup.id}`, Date.now());
        logError("bot", err, setup.guildId);
      }
      return null;
    });
  if (!event) return;
  state.eventId = event.id;
  state.eventAt = start.toISOString();
  ctx.session = await prisma.matchSession.update({ where: { id: session.id }, data: { state: state as unknown as Prisma.InputJsonValue } });
}

async function fetchEvent(ctx: Ctx) {
  if (!ctx.state.eventId) return null;
  const guild = await ctx.client.guilds.fetch(ctx.setup.guildId).catch(() => null);
  return (await guild?.scheduledEvents.fetch(ctx.state.eventId).catch(() => null)) ?? null;
}

async function startEvent(ctx: Ctx) {
  if (ctx.state.eventLive) return;
  const event = await fetchEvent(ctx);
  await event?.setStatus(GuildScheduledEventStatus.Active).catch((err) => logError("bot", err, ctx.setup.guildId));
  ctx.state.eventLive = true;
}

async function endEvent(ctx: Ctx) {
  const event = await fetchEvent(ctx);
  await event?.setStatus(ctx.state.eventLive ? GuildScheduledEventStatus.Completed : GuildScheduledEventStatus.Canceled).catch(() => null);
  ctx.state.eventId = null;
}

// Editing a message doesn't notify anyone, so steps that need attention send
// a short ping, removed once that step is over.
async function ping(ctx: Ctx, text: string) {
  const channel = await ctx.client.channels.fetch(ctx.setup.panelChannelId).catch(() => null);
  if (!isSendableChannel(channel)) return;
  const sent = await channel.send({ content: text, allowedMentions: { parse: ["users", "roles"] } }).catch(() => null);
  if (sent) ctx.state.pingIds.push(sent.id);
}

async function clearPings(ctx: Ctx) {
  const channel = await ctx.client.channels.fetch(ctx.setup.panelChannelId).catch(() => null);
  if (isSendableChannel(channel)) {
    for (const id of ctx.state.pingIds) {
      const message = await channel.messages.fetch(id).catch(() => null);
      await message?.delete().catch(() => null);
    }
  }
  ctx.state.pingIds = [];
}

const roleMention = (setup: MatchSetup) => (setup.pingRoleId ? `<@&${setup.pingRoleId}> ` : "");
const lobbySize = (setup: MatchSetup, kind: string) => (kind === "TOURNAMENT" && setup.tournamentTeams === 0 ? Infinity : setup.teamSize * (kind === "TOURNAMENT" ? setup.tournamentTeams : 2));

async function teamLabel(ctx: Ctx, players: string[], fallback: string): Promise<string> {
  if (ctx.setup.teamSize !== 1 || !players[0]) return fallback;
  const guild = await ctx.client.guilds.fetch(ctx.setup.guildId).catch(() => null);
  const member = await guild?.members.fetch(players[0]).catch(() => null);
  return member?.displayName ?? fallback;
}

// ---- Steps ----

// Teams wait a set time for captains, then the match starts on its own.
const saveTeams = (ctx: Ctx) => save(ctx, "TEAMS", ctx.setup.useTimers ? fromNow(ctx.setup.autoStartSeconds * 1000) : null);

// Hidden rosters go public once registration closes.
async function revealRosters(ctx: Ctx) {
  const { client, setup, state } = ctx;
  if (!state.reveal) return;
  state.reveal = false;
  const channel = await client.channels.fetch(setup.resultsChannelId).catch(() => null);
  if (isSendableChannel(channel)) await channel.send({ embeds: [buildRosters(state.teams, ctx.texts)], allowedMentions: { parse: [] } }).catch((err) => logError("bot", err, setup.guildId));
  await ping(ctx, resolveText(ctx.texts, "pingReveal").text);
}

async function closeSignups(ctx: Ctx) {
  ctx.state.reveal = ctx.setup.rosterView === "HIDDEN";
  if (ctx.session.kind === "TOURNAMENT") return startTournament(ctx);
  if (!ctx.setup.checkIn) return enterTeams(ctx);
  ctx.state.ready = [];
  const endsAt = ctx.setup.useTimers ? fromNow(ctx.setup.checkInSeconds * 1000) : null;
  await ping(ctx, `${roleMention(ctx.setup)}${resolveText(ctx.texts, "pingCheckIn", { players: ctx.state.signups.map((id) => `<@${id}>`).join(" ") }).text}`.slice(0, 2000));
  await save(ctx, "CHECKIN", endsAt);
}

async function enterTeams(ctx: Ctx) {
  const { setup, state } = ctx;
  await clearPings(ctx);
  const perTeam = Math.floor(state.signups.length / 2);
  const ids = state.signups.slice(0, perTeam * 2);
  const ratings = await ratingsFor(setup, ids);

  if (usesPicks(setup)) {
    const groups = [onTeam(state, 0), onTeam(state, 1)];
    if (!groups[0].length || !groups[1].length) {
      await ping(ctx, "Both teams need at least one player, so sign-ups are still open.");
      return save(ctx, "SIGNUP", ctx.session.phaseEndsAt);
    }
    const all = await ratingsFor(setup, state.signups);
    state.teams = groups.map((players, i) => ({ name: slotName(setup, "SINGLE", i), players, captain: pickCaptain(players, all, setup.captainRule) }));
    await revealRosters(ctx);
    return saveTeams(ctx);
  }

  if (setup.balance === "CAPTAINS" && perTeam > 1) {
    const first = pickCaptain(ids, ratings, setup.captainRule);
    const second = pickCaptain(ids.filter((id) => id !== first), ratings, setup.captainRule);
    state.teams = [
      { name: setup.team1Name, players: [first], captain: first },
      { name: setup.team2Name, players: [second], captain: second },
    ];
    state.draftPool = ids.filter((id) => id !== first && id !== second);
    state.draftPick = 0;
    return save(ctx, "DRAFT", fromNow(setup.voteSeconds * 1000));
  }

  await buildTeams(ctx, ids, ratings);
  await revealRosters(ctx);
  await saveTeams(ctx);
}

async function buildTeams(ctx: Ctx, ids: string[], ratings: Record<string, number>) {
  const { setup, state } = ctx;
  const split = splitTeams(ids, ratings, 2, Math.floor(ids.length / 2), setup.balance);
  const names = [setup.team1Name, setup.team2Name];
  state.teams = await Promise.all(
    split.map(async (players, i): Promise<MatchTeam> => ({ name: await teamLabel(ctx, players, names[i]), players, captain: pickCaptain(players, ratings, setup.captainRule) }))
  );
}

async function draftPick(ctx: Ctx, userId: string) {
  const { state } = ctx;
  state.draftPool = state.draftPool.filter((id) => id !== userId);
  state.teams[draftSide(state.draftPick) === "a" ? 0 : 1].players.push(userId);
  state.draftPick++;
  if (state.draftPool.length > 0) return save(ctx, "DRAFT", fromNow(ctx.setup.voteSeconds * 1000));
  await revealRosters(ctx);
  await saveTeams(ctx);
}

async function startTournament(ctx: Ctx): Promise<string | void> {
  const { setup, state } = ctx;
  await clearPings(ctx);
  const ratings = await ratingsFor(setup, state.signups);
  const groups = usesPicks(setup)
    ? Array.from({ length: setup.tournamentTeams }, (_, i) => ({ name: slotName(setup, "TOURNAMENT", i), players: onTeam(state, i) })).filter((g) => g.players.length).sort((x, y) => y.players.length - x.players.length)
    : null;
  const fit = fitBracket(state.signups.length, setup.teamSize, setup.tournamentTeams, setup.flexTeams);
  const teamCount = groups ? bracketTeamCount(groups.length, 1, setup.tournamentTeams || 16) : fit.teams;
  if (teamCount < 2) return groups ? "A bracket needs at least 2 teams with players." : `A bracket needs at least ${setup.teamSize * 2} players.`;
  if (groups) state.teams = groups.slice(0, teamCount).map((g) => ({ ...g, captain: pickCaptain(g.players, ratings, setup.captainRule) }));
  else {
    const ids = shuffle(state.signups).slice(0, teamCount * fit.perTeam);
    const sittingOut = state.signups.filter((id) => !ids.includes(id));
    if (sittingOut.length) await ping(ctx, `${sittingOut.map((id) => `<@${id}>`).join(" ")} The teams came out even without you this time, so you're first in line as a sub.`.slice(0, 2000));
    const split = splitTeams(ids, ratings, teamCount, fit.perTeam, setup.balance === "RANDOM" ? "RANDOM" : "BALANCED");
    state.teams = await Promise.all(
      split.map(async (players, i): Promise<MatchTeam> => ({ name: await teamLabel(ctx, players, slotName(setup, "TOURNAMENT", i)), players, captain: pickCaptain(players, ratings, setup.captainRule) }))
    );
  }
  state.bracket = buildBracket(teamCount);
  state.tie = nextTie(state.bracket);
  await revealRosters(ctx);
  await syncBracket(ctx, true);
  if (setup.teamNaming === "CAPTAIN" && setup.teamSize > 1) {
    await ping(ctx, `${state.teams.map((t) => `<@${t.captain}>`).join(" ")} Name your team on the panel.`.slice(0, 2000));
    return void (await saveTeams(ctx));
  }
  await startMapStep(ctx);
}

async function syncBracket(ctx: Ctx, fresh = false) {
  const { client, setup, state } = ctx;
  const channel = await client.channels.fetch(setup.resultsChannelId).catch(() => null);
  if (!isSendableChannel(channel)) return;
  const embed = bracketEmbed(setup, state, ctx.texts);
  if (setup.bracketMessageId && !fresh) {
    const message = await channel.messages.fetch(setup.bracketMessageId).catch(() => null);
    if (await message?.edit({ embeds: [embed] }).catch(() => null)) return;
  }
  const sent = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => null);
  if (sent) {
    setup.bracketMessageId = sent.id;
    await prisma.matchSetup.update({ where: { id: setup.id }, data: { bracketMessageId: sent.id } });
  }
}

async function startMapStep(ctx: Ctx) {
  const { setup, state } = ctx;
  state.map = null;
  state.mapNote = null;
  state.votes = {};
  state.banned = [];
  state.banTurn = "a";
  state.mapOptions = [];
  const maps = stringList(setup.maps);
  if (!setup.useMaps || maps.length === 0) return goLive(ctx, null, null);

  const recent = setup.skipRecent
    ? (await prisma.matchResult.findMany({ where: { setupId: setup.id, voided: false }, orderBy: { createdAt: "desc" }, take: setup.skipRecent, select: { map: true } })).map((r) => r.map ?? "")
    : [];
  if (setup.mapMethod === "RANDOM") return goLive(ctx, pickOne(mapPool(maps, recent, 1)), "Picked at random by the bot");

  state.mapOptions = shuffle(mapPool(maps, recent, setup.mapChoices)).slice(0, setup.mapChoices);
  await save(ctx, "MAP", fromNow(setup.voteSeconds * 1000));
}

async function closeVote(ctx: Ctx) {
  const { winner, note } = tallyVotes(ctx.state.mapOptions, ctx.state.votes);
  await goLive(ctx, winner, note);
}

async function banMap(ctx: Ctx, map: string) {
  const { state, setup } = ctx;
  state.banned.push(map);
  state.banTurn = state.banTurn === "a" ? "b" : "a";
  const left = state.mapOptions.filter((m) => !state.banned.includes(m));
  if (left.length === 1) return goLive(ctx, left[0], `Last one left after ${state.banned.length} bans`);
  await save(ctx, "MAP", fromNow(setup.voteSeconds * 1000));
}

async function goLive(ctx: Ctx, map: string | null, note: string | null) {
  const { setup, state } = ctx;
  await clearPings(ctx);
  state.map = map;
  state.mapNote = note;
  state.report = null;
  state.reminded = false;
  state.disputes = 0;
  if (state.tie) state.bracket[state.tie[0]][state.tie[1]].map = map;
  const deadline = setup.useTimers ? fromNow(setup.reportMinutes * 60_000) : null;
  await startEvent(ctx);
  await save(ctx, "LIVE", deadline);
  const pings = await openTeamRooms(ctx);
  if (pings.length) await ping(ctx, pings.join("\n").slice(0, 2000));
  await save(ctx, "LIVE", deadline);
}

// Team matches get a channel per team, and a 1v1 shares one, using the voice
// settings from the Settings tab.
async function openTeamRooms(ctx: Ctx): Promise<string[]> {
  const { client, setup, session, state } = ctx;
  const teams = currentTeams(state);
  if (!setup.autoMove || !setup.lobbyVoiceId || !teams) return [];
  const guild = await client.guilds.fetch(setup.guildId).catch(() => null);
  const main = await guild?.channels.fetch(setup.lobbyVoiceId).catch(() => null);
  if (!guild || !main?.isVoiceBased()) return ["The main voice channel for this match is gone. Pick a new one on the dashboard."];
  const config = await prisma.matchmakingConfig.findUnique({ where: { guildId: setup.guildId } });
  const { voiceIds, pings } = await openVoiceRooms({ guild, config, lobbyId: setup.lobbyVoiceId, fallbackCategoryId: main.parentId, game: setup.game, map: state.map, number: session.number, a: teams[0], b: teams[1], shared: setup.teamSize === 1, texts: ctx.texts as TextOverrides });
  state.voiceIds.push(...voiceIds);
  return pings;
}

async function closeTeamRooms(ctx: Ctx) {
  const { client, setup, state } = ctx;
  if (state.voiceIds.length === 0) return;
  const config = await prisma.matchmakingConfig.findUnique({ where: { guildId: setup.guildId } });
  await closeVoiceRooms(client, config, state.voiceIds, setup.lobbyVoiceId, setup.guildId);
  state.voiceIds = [];
}

async function payPlayers(ctx: Ctx, ids: string[], won: boolean) {
  const { client, setup } = ctx;
  const coins = !setup.rewardsEnabled ? 0 : won ? setup.winCoins : setup.lossCoins;
  const economyOn = await isModuleEnabled(setup.guildId, "ECONOMY");
  const economy = economyOn ? await getConfig(setup.guildId) : null;
  for (const userId of ids) {
    const change = ratingChange(won);
    await prisma.matchPlayer.upsert({
      where: { setupId_userId: { setupId: setup.id, userId } },
      create: { setupId: setup.id, guildId: setup.guildId, userId, rating: 1000 + change, wins: won ? 1 : 0, losses: won ? 0 : 1, streak: won ? 1 : 0, coinsEarned: coins },
      update: { rating: { increment: change }, wins: { increment: won ? 1 : 0 }, losses: { increment: won ? 0 : 1 }, coinsEarned: { increment: coins }, streak: won ? { increment: 1 } : 0 },
    });
    if (economy && coins > 0) await addBalance(setup.guildId, userId, coins, "match", economy.maxBalance);
    if (won && setup.rewardsEnabled) await awardAchievement(client, setup.guildId, userId, `MATCH_FIRST_WIN:${setup.id}`, `First ${setup.game} match win`, setup.resultsChannelId).catch((err) => logError("bot", err, setup.guildId));
  }
}

async function finishMatch(ctx: Ctx, report: MatchReport) {
  const { client, setup, state, session } = ctx;
  const teams = currentTeams(state);
  if (!teams) return;
  await clearPings(ctx);
  const [winner, loser] = report.winner === "a" ? teams : [teams[1], teams[0]];
  const trackTeams = setup.teamSize > 1 && (usesPicks(setup) || setup.teamNaming === "CAPTAIN");
  const named = (name: string) => (trackTeams && countsAsNamedTeam(name, setup.team1Name, setup.team2Name) ? name : null);
  await payPlayers(ctx, winner.players, true);
  await payPlayers(ctx, loser.players, false);
  const result = await prisma.matchResult.create({
    data: {
      setupId: setup.id,
      guildId: setup.guildId,
      sessionId: session.id,
      number: session.number,
      game: setup.game,
      winnerTeam: named(winner.name),
      loserTeam: named(loser.name),
      map: state.map,
      winnerName: winner.name,
      loserName: loser.name,
      winnerScore: report.winnerScore,
      loserScore: report.loserScore,
      winners: winner.players,
      losers: loser.players,
      winCoins: setup.rewardsEnabled ? setup.winCoins : 0,
      lossCoins: setup.rewardsEnabled ? setup.lossCoins : 0,
    },
  });
  const channel = await client.channels.fetch(setup.resultsChannelId).catch(() => null);
  if (isSendableChannel(channel)) await channel.send({ embeds: [buildResult(setup, result, ctx.texts)], allowedMentions: { parse: [] } }).catch((err) => logError("bot", err, setup.guildId));
  await syncBoard(client, setup.guildId, setup.game);
  await closeTeamRooms(ctx);

  if (state.tie) {
    const champion = recordTie(state.bracket, state.tie, report.winner, report.winnerScore, report.loserScore);
    state.tie = nextTie(state.bracket);
    await syncBracket(ctx);
    if (champion === null) return startMapStep(ctx);
    state.champion = champion;
    await crownChampion(ctx, state.teams[champion]);
    await endEvent(ctx);
  } else {
    await endEvent(ctx);
    state.winner = report.winner;
    state.score = `${report.winnerScore}-${report.loserScore}`;
  }
  await save(ctx, "DONE");
}

async function crownChampion(ctx: Ctx, team: MatchTeam) {
  const { client, setup } = ctx;
  const guild = await client.guilds.fetch(setup.guildId).catch(() => null);
  const economyOn = await isModuleEnabled(setup.guildId, "ECONOMY");
  const economy = economyOn ? await getConfig(setup.guildId) : null;
  for (const userId of team.players) {
    const bonus = setup.rewardsEnabled ? setup.championCoins : 0;
    await prisma.matchPlayer.update({ where: { setupId_userId: { setupId: setup.id, userId } }, data: { tournamentWins: { increment: 1 }, coinsEarned: { increment: bonus } } });
    if (economy && bonus > 0) await addBalance(setup.guildId, userId, bonus, "match_champion", economy.maxBalance);
    if (setup.rewardsEnabled && setup.championRoleId) {
      const member = await guild?.members.fetch(userId).catch(() => null);
      await member?.roles.add(setup.championRoleId).catch((err) => logError("bot", err, setup.guildId));
    }
  }
}

async function replaceSession(ctx: Ctx, signups: string[] = []) {
  await clearPings(ctx);
  await endEvent(ctx);
  await prisma.matchSession.update({ where: { id: ctx.session.id }, data: { closedAt: new Date(), phaseEndsAt: null, state: ctx.state as unknown as Prisma.InputJsonValue } });
  ctx.session = await openSession(ctx.setup, signups);
  ctx.state = readState(ctx.session);
}

async function expirePhase(ctx: Ctx) {
  const { session, state, setup } = ctx;
  if (session.phase === "SIGNUP") {
    const enough = session.kind === "TOURNAMENT" ? fitBracket(state.signups.length, setup.teamSize, setup.tournamentTeams, setup.flexTeams).teams >= 2 : state.signups.length >= 2 && setup.startMode === "SCHEDULED";
    if (enough) {
      const problem = await closeSignups(ctx);
      if (!problem) return;
    }
    state.signups = [];
    state.picks = {};
    await clearPings(ctx);
    await ping(ctx, "Not enough players joined in time, so sign-ups were reset.");
    return save(ctx, "SIGNUP");
  }
  if (session.phase === "CHECKIN") {
    state.signups = state.signups.filter((id) => state.ready.includes(id));
    await clearPings(ctx);
    if (state.signups.length >= lobbySize(setup, session.kind)) return enterTeams(ctx);
    await ping(ctx, `${roleMention(setup)}Not everyone checked in, so sign-ups are open again.`);
    state.picks = Object.fromEntries(Object.entries(state.picks).filter(([id]) => state.signups.includes(id)));
    return save(ctx, "SIGNUP", state.signups.length ? signupDeadline(setup) : null);
  }
  if (session.phase === "DRAFT") {
    const ratings = await ratingsFor(setup, state.draftPool);
    return draftPick(ctx, pickCaptain(state.draftPool, ratings, "TOP"));
  }
  if (session.phase === "TEAMS") return startMapStep(ctx);
  if (session.phase === "MAP") {
    if (setup.mapMethod === "BANS") return banMap(ctx, pickOne(state.mapOptions.filter((m) => !state.banned.includes(m))));
    return closeVote(ctx);
  }
  if (session.phase === "LIVE") return chaseScore(ctx);
  if (session.phase === "CONFIRM" && state.report) return finishMatch(ctx, state.report);
}

// A missing score gets one reminder. After that a single match follows the
// setup's rule, while a tournament goes to staff since canceling a tie would
// end everyone's bracket.
async function chaseScore(ctx: Ctx) {
  const { setup, session, state } = ctx;
  const teams = currentTeams(state);
  if (!state.reminded) {
    state.reminded = true;
    await ping(ctx, `${teams?.map((t) => `<@${t.captain}>`).join(" ")} Please report your score on the panel.`);
    return save(ctx, "LIVE", fromNow(REMINDER_GRACE_MS));
  }
  if (session.kind === "TOURNAMENT" || setup.noReportAction === "ALERT") {
    await ping(ctx, `${setup.staffRoleId ? `<@&${setup.staffRoleId}> ` : ""}Nobody reported this match. Staff can report the score on the panel or cancel it.`);
    return save(ctx, "LIVE");
  }
  await cancelCtx(ctx);
  await ping(ctx, "That match had no score reported, so it was canceled and nothing was recorded.");
  await save(ctx, "SIGNUP");
}

async function swapPlayer(ctx: Ctx, out: string, sub: string): Promise<string> {
  const { client, setup, session, state } = ctx;
  const team = replacePlayer(state, out, sub);
  if (!team) return "That player isn't on a team.";
  const room = state.voiceIds[Math.min(currentTeams(state)?.indexOf(team) ?? -1, state.voiceIds.length - 1)];
  if (room) {
    const guild = await client.guilds.fetch(setup.guildId).catch(() => null);
    const member = await guild?.members.fetch({ user: sub, force: true }).catch(() => null);
    const moved = member?.voice.channelId ? await member.voice.setChannel(room).catch(() => null) : null;
    if (!moved) await ping(ctx, `<@${sub}> You're subbing in for ${team.name}. Join <#${room}>.`);
  }
  await save(ctx, session.phase, session.phaseEndsAt);
  return `<@${sub}> is in for <@${out}> on ${team.name}.`;
}

// ---- Member actions ----

function memberIsStaff(member: GuildMember | null, setup: MatchSetup): boolean {
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.ManageGuild) || (!!setup.staffRoleId && member.roles.cache.has(setup.staffRoleId));
}

const isCaptain = (ctx: Ctx, userId: string) => !!currentTeams(ctx.state)?.some((t) => t.captain === userId);

function rankPicker(setup: MatchSetup, slot?: number, group?: number): InteractionEditReplyOptions {
  const ranks = stringList(setup.ranks);
  const groups = rankGroups(ranks);
  const customId = `matchrank:${setup.id}${slot === undefined ? "" : `:${slot}`}`;
  const pickTier = ranks.length > 25 && group === undefined;
  const options = pickTier
    ? groups.map((g, i) => ({ label: g.name.slice(0, 100), value: g.indexes.length === 1 ? String(g.indexes[0]) : `tier:${i}` }))
    : (group === undefined ? ranks.map((_, i) => i) : groups[group].indexes).map((i) => ({ label: ranks[i].slice(0, 100), value: String(i) }));
  const menu = new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder("Your rank").addOptions(options);
  return { content: pickTier ? `Pick your ${setup.game} rank tier. It's used to balance teams.` : `Pick your ${setup.game} rank to continue. It's used to balance teams.`, components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)] };
}

async function join(ctx: Ctx, userId: string, slot?: number): Promise<Reply> {
  const { setup, session, state } = ctx;
  if (session.phase !== "SIGNUP") return "Sign-ups are closed for this match.";
  if (state.signups.includes(userId)) return "You're already in.";
  const picking = usesPicks(setup);
  if (picking && (slot === undefined || slot >= slotCount(setup, session.kind))) return "Pick a team on the panel.";
  if (picking && onTeam(state, slot!).length >= setup.teamSize) return "That team is full. Pick another one.";
  if (setup.useRanks) {
    const player = await prisma.matchPlayer.findUnique({ where: { setupId_userId: { setupId: setup.id, userId } } });
    if (player?.rank === null || player?.rank === undefined) return rankPicker(setup, slot);
  }
  state.signups.push(userId);
  if (picking) state.picks[userId] = slot!;
  const full = state.signups.length >= lobbySize(setup, session.kind);
  if (full && setup.startMode === "FULL") await closeSignups(ctx);
  else {
    if (full && !state.fullPinged) {
      state.fullPinged = true;
      await ping(ctx, `${setup.staffRoleId ? `<@&${setup.staffRoleId}> ` : ""}${setup.pingRoleId ? `<@&${setup.pingRoleId}> ` : ""}${resolveText(ctx.texts, "pingFull").text}${setup.startMode === "MANUAL" ? " Staff can start it from the panel." : ""}`);
    }
    await save(ctx, "SIGNUP", session.phaseEndsAt ?? signupDeadline(setup));
  }
  if (picking) {
    const name = slotName(setup, session.kind, slot!);
    return setup.rosterView === "HIDDEN" ? `You're on ${name}. Your teammates stay hidden until registration closes.` : `You're on ${name}.`;
  }
  return session.kind === "TOURNAMENT" ? "You're registered." : `You're in for Match #${session.number}.`;
}

async function runAction(client: Client, setupId: string, action: string, arg: string | undefined, userId: string, member: GuildMember | null): Promise<Reply> {
  const ctx = await loadCtx(client, setupId);
  if (!ctx) return "This match setup no longer exists.";
  const { setup, session, state } = ctx;
  const staff = memberIsStaff(member, setup);
  const staffOnly = "Only staff can do that.";

  switch (action) {
    case "join":
      return join(ctx, userId);
    case "pick":
      return join(ctx, userId, Number(arg));
    case "myteam": {
      const slot = state.picks[userId];
      if (slot === undefined) return "You aren't on a team.";
      const name = slotName(setup, session.kind, slot);
      return setup.rosterView === "HIDDEN" ? `You're on ${name}. ${onTeam(state, slot).length}/${setup.teamSize} slots are filled, and names stay hidden until registration closes.` : `You're on ${name}.`;
    }
    case "leave":
      if (session.phase !== "SIGNUP") return "You can't leave once sign-ups have closed. Ask staff to cancel the match.";
      if (!state.signups.includes(userId)) return "You aren't signed up.";
      state.signups = state.signups.filter((id) => id !== userId);
      delete state.picks[userId];
      state.fullPinged = false;
      await save(ctx, "SIGNUP", state.signups.length || setup.startMode === "SCHEDULED" ? session.phaseEndsAt : null);
      return "You left the sign-ups.";
    case "ready":
      if (session.phase !== "CHECKIN") return "Check-in isn't running.";
      if (!state.signups.includes(userId)) return "You aren't in this match.";
      if (!state.ready.includes(userId)) state.ready.push(userId);
      if (state.ready.length >= state.signups.length) await enterTeams(ctx);
      else await save(ctx, "CHECKIN", session.phaseEndsAt);
      return "You're checked in.";
    case "start":
      if (session.phase !== "TEAMS") return "The match isn't ready to start.";
      if (!staff && !isCaptain(ctx, userId)) return "Only captains or staff can start the match.";
      await startMapStep(ctx);
      return "Match started.";
    case "vote": {
      if (session.phase !== "MAP" || setup.mapMethod !== "VOTE") return "Voting is closed.";
      const teams = currentTeams(state);
      if (!teams?.some((t) => t.players.includes(userId))) return "Only players in this match can vote.";
      const choice = state.mapOptions[Number(arg)];
      if (!choice) return "That option is gone.";
      state.votes[userId] = choice;
      const everyone = teams[0].players.length + teams[1].players.length;
      if (Object.keys(state.votes).length >= everyone) await closeVote(ctx);
      else await save(ctx, "MAP", session.phaseEndsAt);
      return `You voted for ${choice}. Tap another to change it.`;
    }
    case "ban": {
      if (session.phase !== "MAP" || setup.mapMethod !== "BANS") return "Bans are closed.";
      const teams = currentTeams(state);
      if (!staff && teams?.[state.banTurn === "a" ? 0 : 1].captain !== userId) return "It's not your turn to ban.";
      const choice = state.mapOptions[Number(arg)];
      if (!choice || state.banned.includes(choice)) return "That one is already banned.";
      await banMap(ctx, choice);
      return `You banned ${choice}.`;
    }
    case "confirm":
    case "dispute": {
      if (session.phase !== "CONFIRM" || !state.report) return "There's nothing to confirm.";
      const reporter = state.report.by;
      const responder = currentTeams(state)?.find((t) => t.captain !== reporter)?.captain;
      if (!staff && responder !== userId) return "Only the other captain or staff can respond to this.";
      if (action === "confirm") {
        await finishMatch(ctx, state.report);
        return "Result confirmed.";
      }
      state.report = null;
      state.disputes++;
      state.reminded = true;
      await clearPings(ctx);
      await ping(ctx, state.disputes >= 2 ? `${setup.staffRoleId ? `<@&${setup.staffRoleId}> ` : ""}Captains disagreed twice. Only staff can report this score now.` : "Result disputed. Captains can report once more, then it goes to staff.");
      await save(ctx, "LIVE", setup.useTimers ? fromNow(setup.reportMinutes * 60_000) : null);
      return "Result disputed.";
    }
    case "runback": {
      if (session.phase !== "DONE" || session.kind !== "SINGLE") return "This match is still going.";
      if (!staff && !state.signups.includes(userId)) return "Only players from this match or staff can run it back.";
      await replaceSession(ctx, state.signups);
      await closeSignups(ctx);
      return "Running it back.";
    }
    case "new":
      if (session.phase !== "DONE") return "This match is still going.";
      if (session.kind === "TOURNAMENT" && !staff) return staffOnly;
      await replaceSession(ctx);
      await save(ctx, "SIGNUP");
      return "Sign-ups are open.";
    case "subs": {
      if (!ACTIVE_PHASES.includes(session.phase)) return "Subs open once teams are set.";
      const playing = state.teams.some((t) => t.players.includes(userId));
      if (!playing && state.subsNeeded.length === 0) return "No open slots right now.";
      const choice = playing ? ["subout", "I Can't Play", ButtonStyle.Danger] : ["subin", "Sub In", ButtonStyle.Success];
      return {
        content: playing ? "Can't play? This opens your slot for a sub. You stay in until someone takes it." : `${state.subsNeeded.length} slot open.`,
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`match:${setup.id}:${choice[0]}`).setLabel(choice[1] as string).setStyle(choice[2] as ButtonStyle))],
      };
    }
    case "subout": {
      if (!ACTIVE_PHASES.includes(session.phase) || !state.teams.some((t) => t.players.includes(userId))) return "You can't do that right now.";
      if (state.subsNeeded.includes(userId)) return "Your slot is already open.";
      state.subsNeeded.push(userId);
      await ping(ctx, `${roleMention(setup)}A sub is needed. Tap Subs on the panel to jump in.`);
      await save(ctx, session.phase, session.phaseEndsAt);
      return "Your slot is open. You'll be replaced when someone takes it.";
    }
    case "subin": {
      if (!ACTIVE_PHASES.includes(session.phase) || state.subsNeeded.length === 0) return "No open slots right now.";
      if (state.teams.some((t) => t.players.includes(userId))) return "You're already on a team.";
      if (setup.useRanks) {
        const player = await prisma.matchPlayer.findUnique({ where: { setupId_userId: { setupId: setup.id, userId } } });
        if (player?.rank === null || player?.rank === undefined) return rankPicker(setup);
      }
      return swapPlayer(ctx, state.subsNeeded[0], userId);
    }
    case "stats": {
      const player = await prisma.matchPlayer.findUnique({ where: { setupId_userId: { setupId: setup.id, userId } } });
      return { embeds: [buildStats(setup, player, ctx.texts)] };
    }
    case "board": {
      const rows = await prisma.matchPlayer.findMany({ where: { setupId: setup.id, OR: [{ wins: { gt: 0 } }, { losses: { gt: 0 } }] }, orderBy: [{ wins: "desc" }, { rating: "desc" }], take: 15 });
      return { embeds: [buildLeaderboard(setup, rows)], allowedMentions: { parse: [] } };
    }
    case "staff": {
      if (!staff) return staffOnly;
      const buttons: ButtonBuilder[] = [];
      const add = (id: string, label: string, style = ButtonStyle.Primary) => buttons.push(new ButtonBuilder().setCustomId(`match:${setup.id}:${id}`).setLabel(label).setStyle(style));
      if (session.phase === "SIGNUP") add("force", state.signups.length >= lobbySize(setup, session.kind) ? "Start Now" : "Start With Fewer");
      if (session.phase === "CHECKIN") add("skipcheck", "Skip Check-In");
      if (session.phase === "TEAMS") add("reroll", "Reroll Teams");
      if (session.phase === "MAP" && setup.mapMethod === "VOTE") add("endvote", "End Vote Now");
      if (session.phase !== "DONE") add("cancel", "Cancel Match", ButtonStyle.Danger);
      if (!buttons.length) return "No staff actions right now.";
      return { content: "Staff controls:", components: [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)] };
    }
    case "force":
      if (!staff) return staffOnly;
      if (session.phase !== "SIGNUP") return "Sign-ups are already closed.";
      if (state.signups.length < 2) return "You need at least 2 players.";
      return (await closeSignups(ctx)) ?? "Starting with the players signed up.";
    case "skipcheck":
      if (!staff) return staffOnly;
      if (session.phase !== "CHECKIN") return "Check-in isn't running.";
      await enterTeams(ctx);
      return "Check-in skipped.";
    case "reroll": {
      if (!staff) return staffOnly;
      if (session.phase !== "TEAMS") return "Teams can only be rerolled before the match starts.";
      if (usesPicks(setup)) return "Players chose these teams, so they can't be rerolled.";
      const ids = state.teams.flatMap((t) => t.players);
      await buildTeams(ctx, shuffle(ids), await ratingsFor(setup, ids));
      await saveTeams(ctx);
      return "Teams rerolled.";
    }
    case "endvote":
      if (!staff) return staffOnly;
      if (session.phase !== "MAP") return "Voting is closed.";
      await closeVote(ctx);
      return "Vote ended.";
    case "cancel":
      if (!staff) return staffOnly;
      await cancelCtx(ctx);
      return "Match canceled. Sign-ups are open again.";
  }
  return null;
}

async function cancelCtx(ctx: Ctx) {
  await closeTeamRooms(ctx);
  await replaceSession(ctx);
  await save(ctx, "SIGNUP");
}

// ---- Discord entry points ----

async function respond(interaction: ButtonInteraction | StringSelectMenuInteraction | ChatInputCommandInteraction | ModalSubmitInteraction, reply: Reply) {
  if (reply === null) await interaction.deleteReply().catch(() => null);
  else await interaction.editReply(typeof reply === "string" ? { content: reply, components: [], embeds: [] } : reply);
}

const failed = "Something went wrong with that. Staff can see the details on the Errors page.";

export async function handleMatchButton(interaction: ButtonInteraction) {
  const [, setupId, action, arg] = interaction.customId.split(":");
  const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
  if (action === "report") return openScoreModal(interaction, setupId, arg as Side, member ?? null);
  if (action === "name") return openNameModal(interaction, setupId);

  await interaction.deferReply({ ephemeral: true });
  try {
    await respond(interaction, await withLock(setupId, () => runAction(interaction.client, setupId, action, arg, interaction.user.id, member ?? null)));
  } catch (err) {
    logError("bot", err, interaction.guildId ?? undefined);
    await interaction.editReply({ content: failed, components: [] }).catch(() => null);
  }
}

async function openScoreModal(interaction: ButtonInteraction, setupId: string, side: Side, member: GuildMember | null) {
  const ctx = await loadCtx(interaction.client, setupId);
  if (!ctx) return;
  const { setup, session } = ctx;
  if (session.phase !== "LIVE") return void interaction.reply({ content: "This match isn't waiting for a result.", ephemeral: true });
  const staff = memberIsStaff(member, setup);
  const staffOnly = setup.reportBy === "STAFF" || ctx.state.disputes >= 2;
  if (staffOnly ? !staff : !staff && !isCaptain(ctx, interaction.user.id)) {
    return void interaction.reply({ content: staffOnly ? "Only staff can report this result." : "Only captains or staff can report results.", ephemeral: true });
  }
  const winner = currentTeams(ctx.state)?.[side === "a" ? 0 : 1].name ?? "Winner";
  const field = (id: string, label: string) => new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label.slice(0, 45)).setStyle(TextInputStyle.Short).setMaxLength(4).setRequired(true));
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(`matchscore:${setupId}:${side}`)
      .setTitle(`Report: ${winner} Won`.slice(0, 45))
      .addComponents(field("winner", `Winner ${setup.scoreName}`), field("loser", `Loser ${setup.scoreName}`))
  );
}

async function openNameModal(interaction: ButtonInteraction, setupId: string) {
  const ctx = await loadCtx(interaction.client, setupId);
  const team = ctx?.state.teams.find((t) => t.captain === interaction.user.id);
  if (!ctx || ctx.session.phase !== "TEAMS" || !team) return void interaction.reply({ content: "Only a team captain can do that, before the match starts.", ephemeral: true });
  const field = new TextInputBuilder().setCustomId("name").setLabel("Team name").setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(32).setRequired(true).setValue(team.name.slice(0, 32));
  await interaction.showModal(new ModalBuilder().setCustomId(`matchname:${setupId}`).setTitle("Name Your Team").addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(field)));
}

export async function handleMatchName(interaction: ModalSubmitInteraction) {
  const setupId = interaction.customId.split(":")[1];
  await interaction.deferReply({ ephemeral: true });
  const name = cleanTeamName(interaction.fields.getTextInputValue("name"));
  try {
    const reply = await withLock(setupId, async () => {
      const ctx = await loadCtx(interaction.client, setupId);
      if (!ctx || ctx.session.phase !== "TEAMS") return "It's too late to change the name.";
      const { state, session } = ctx;
      const index = state.teams.findIndex((t) => t.captain === interaction.user.id);
      if (index < 0) return "Only a team captain can do that.";
      if (name.length < 2) return "Use at least 2 letters or numbers.";
      if (state.teams.some((t, i) => i !== index && t.name.toLowerCase() === name.toLowerCase())) return "Another team already has that name.";
      state.teams[index].name = name;
      if (!state.named.includes(index)) state.named.push(index);
      if (state.tie) await syncBracket(ctx);
      if (session.kind === "TOURNAMENT" && state.named.length === state.teams.length) await startMapStep(ctx);
      else await save(ctx, "TEAMS", session.phaseEndsAt);
      return `Your team is now ${name}.`;
    });
    await interaction.editReply(reply);
  } catch (err) {
    logError("bot", err, interaction.guildId ?? undefined);
    await interaction.editReply(failed).catch(() => null);
  }
}

export async function handleMatchScore(interaction: ModalSubmitInteraction) {
  const [, setupId, sideArg] = interaction.customId.split(":");
  const side = sideArg as Side;
  const winnerScore = Number(interaction.fields.getTextInputValue("winner"));
  const loserScore = Number(interaction.fields.getTextInputValue("loser"));
  await interaction.deferReply({ ephemeral: true });
  if (!Number.isInteger(winnerScore) || !Number.isInteger(loserScore) || loserScore < 0 || winnerScore <= loserScore) {
    await interaction.editReply("The winner needs a higher score than the loser. Enter whole numbers, like 4 and 2.");
    return;
  }
  const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
  try {
    const reply = await withLock(setupId, async (): Promise<string> => {
      const ctx = await loadCtx(interaction.client, setupId);
      if (!ctx || ctx.session.phase !== "LIVE") return "This match isn't waiting for a result.";
      const report: MatchReport = { winner: side, winnerScore, loserScore, by: interaction.user.id };
      const { setup, state } = ctx;
      const staff = memberIsStaff(member ?? null, setup);
      if (!staff && state.disputes >= 2) return "Only staff can report this result.";
      if (staff || setup.reportBy !== "BOTH") {
        await finishMatch(ctx, report);
        return "Result saved.";
      }
      state.report = report;
      const other = currentTeams(state)?.find((t) => t.captain !== interaction.user.id);
      await ping(ctx, `<@${other?.captain}> Please confirm the result on the panel.`);
      await save(ctx, "CONFIRM", new Date(Date.now() + CONFIRM_MS));
      return "Result sent. The other captain has 5 minutes to respond.";
    });
    await interaction.editReply(reply);
  } catch (err) {
    logError("bot", err, interaction.guildId ?? undefined);
    await interaction.editReply(failed).catch(() => null);
  }
}

export async function handleMatchRank(interaction: StringSelectMenuInteraction) {
  const [, setupId, slotArg] = interaction.customId.split(":");
  const picked = interaction.values[0];
  const rank = Number(picked);
  await interaction.deferUpdate();
  try {
    const reply = await withLock(setupId, async () => {
      const ctx = await loadCtx(interaction.client, setupId);
      if (!ctx) return "This match setup no longer exists.";
      if (picked.startsWith("tier:")) return rankPicker(ctx.setup, slotArg === undefined ? undefined : Number(slotArg), Number(picked.slice(5)));
      await setPlayerRank(ctx.setup, interaction.user.id, rank);
      if (ctx.session.phase === "SIGNUP") return join(ctx, interaction.user.id, slotArg === undefined ? undefined : Number(slotArg));
      return "Rank saved. Tap Subs on the panel again to jump in.";
    });
    await respond(interaction, reply);
  } catch (err) {
    logError("bot", err, interaction.guildId ?? undefined);
    await interaction.editReply({ content: failed, components: [] }).catch(() => null);
  }
}

async function setPlayerRank(setup: MatchSetup, userId: string, rank: number) {
  const rating = ratingFromRank(rank, stringList(setup.ranks).length);
  const existing = await prisma.matchPlayer.findUnique({ where: { setupId_userId: { setupId: setup.id, userId } } });
  const played = !!existing && existing.wins + existing.losses > 0;
  await prisma.matchPlayer.upsert({
    where: { setupId_userId: { setupId: setup.id, userId } },
    create: { setupId: setup.id, guildId: setup.guildId, userId, rank, rating },
    update: { rank, ...(played ? {} : { rating }) },
  });
}

export async function handleMatchDraft(interaction: StringSelectMenuInteraction) {
  const setupId = interaction.customId.split(":")[1];
  await interaction.deferReply({ ephemeral: true });
  try {
    const reply = await withLock(setupId, async () => {
      const ctx = await loadCtx(interaction.client, setupId);
      if (!ctx || ctx.session.phase !== "DRAFT") return "The draft is over.";
      const team = ctx.state.teams[draftSide(ctx.state.draftPick) === "a" ? 0 : 1];
      if (team.captain !== interaction.user.id) return "It's not your pick.";
      await draftPick(ctx, interaction.values[0]);
      return "Picked.";
    });
    await interaction.editReply(reply);
  } catch (err) {
    logError("bot", err, interaction.guildId ?? undefined);
    await interaction.editReply(failed).catch(() => null);
  }
}

// /match works in a setup's panel channel, or anywhere if there's only one.
async function setupForCommand(guildId: string, channelId: string): Promise<MatchSetup | null> {
  const setups = await prisma.matchSetup.findMany({ where: { guildId, enabled: true } });
  return setups.find((s) => s.panelChannelId === channelId || s.resultsChannelId === channelId) ?? (setups.length === 1 ? setups[0] : null);
}

export async function handleMatchCommand(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: true });
  const setup = interaction.guildId ? await setupForCommand(interaction.guildId, interaction.channelId) : null;
  if (!setup) {
    await interaction.editReply("Use this in a match channel.");
    return;
  }
  const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
  try {
    if (sub === "setrank") {
      if (!memberIsStaff(member ?? null, setup)) return void (await interaction.editReply("Only staff can do that."));
      const target = interaction.options.getUser("user", true);
      const name = interaction.options.getString("rank", true).trim().toLowerCase();
      const ranks = stringList(setup.ranks);
      const rank = ranks.findIndex((r) => r.toLowerCase() === name);
      if (rank < 0) return void (await interaction.editReply(`Pick one of: ${ranks.join(", ")}`.slice(0, 2000)));
      await setPlayerRank(setup, target.id, rank);
      await interaction.editReply(`Set ${target}'s rank to ${ranks[rank]}.`);
      return;
    }
    if (sub === "sub") {
      if (!memberIsStaff(member ?? null, setup)) return void (await interaction.editReply("Only staff can do that."));
      const out = interaction.options.getUser("out", true);
      const replacement = interaction.options.getUser("in", true);
      const reply = await withLock(setup.id, async () => {
        const ctx = await loadCtx(interaction.client, setup.id);
        if (!ctx || !ACTIVE_PHASES.includes(ctx.session.phase)) return "Subs open once teams are set.";
        if (ctx.state.teams.some((t) => t.players.includes(replacement.id))) return `${replacement} is already on a team.`;
        return swapPlayer(ctx, out.id, replacement.id);
      });
      await interaction.editReply(reply);
      return;
    }
    const action = { join: "join", leave: "leave", stats: "stats", leaderboard: "board" }[sub] ?? "stats";
    await respond(interaction, await withLock(setup.id, () => runAction(interaction.client, setup.id, action, undefined, interaction.user.id, member ?? null)));
  } catch (err) {
    logError("bot", err, interaction.guildId ?? undefined);
    await interaction.editReply(failed).catch(() => null);
  }
}

// ---- Timer ----

// Discord drops an event left past its start time, so unstarted ones stay ahead.
let lastEventSweep = 0;
async function keepEventsAhead(client: Client) {
  if (Date.now() - lastEventSweep < 60_000) return;
  lastEventSweep = Date.now();
  const open = await prisma.matchSession.findMany({ where: { closedAt: null, phase: "SIGNUP" }, include: { setup: true }, take: 50 });
  for (const row of open) {
    if (row.setup.startMode === "SCHEDULED" && row.phaseEndsAt) continue;
    const state = readState(row);
    if (!state.eventId || !state.eventAt || new Date(state.eventAt).getTime() > Date.now() + 10 * 60_000) continue;
    await withLock(row.setupId, async () => {
      const ctx = await loadCtx(client, row.setupId);
      if (!ctx || ctx.session.id !== row.id) return;
      const event = await fetchEvent(ctx);
      const next = new Date(Date.now() + EVENT_LEAD_MS);
      await event?.edit({ scheduledStartTime: next }).catch((err) => logError("bot", err, row.guildId));
      ctx.state.eventAt = next.toISOString();
      await prisma.matchSession.update({ where: { id: row.id }, data: { state: ctx.state as unknown as Prisma.InputJsonValue } });
    }).catch((err) => logError("bot", err, row.guildId));
  }
}

// The old per-setup leaderboard message is replaced by the Leaderboard tab.
async function removeOldBoards(client: Client) {
  const old = await prisma.matchSetup.findMany({ where: { leaderboardMessageId: { not: null } }, take: 10 });
  for (const setup of old) {
    const channel = await client.channels.fetch(setup.resultsChannelId).catch(() => null);
    if (isSendableChannel(channel)) {
      const message = await channel.messages.fetch(setup.leaderboardMessageId!).catch(() => null);
      await message?.delete().catch(() => null);
    }
    await prisma.matchSetup.update({ where: { id: setup.id }, data: { leaderboardMessageId: null } });
  }
}

export async function tickMatches(client: Client) {
  await removeOldBoards(client);
  await keepEventsAhead(client);
  await tickMatchmaking(client);
  const pending = await prisma.matchSetup.findMany({ where: { enabled: true, panelMessageId: null }, take: 10 });
  for (const setup of pending) {
    if (!(await isModuleEnabled(setup.guildId, "MATCHES"))) continue;
    await withLock(setup.id, async () => {
      const ctx = await loadCtx(client, setup.id);
      if (!ctx) return;
      await syncPanel(ctx);
    }).catch((err) => logError("bot", err, setup.guildId));
  }

  const now = new Date();
  const expired = await prisma.matchSession.findMany({ where: { closedAt: null, phaseEndsAt: { lte: now } }, take: 20 });
  for (const row of expired) {
    await withLock(row.setupId, async () => {
      const ctx = await loadCtx(client, row.setupId);
      if (ctx && ctx.session.id === row.id && ctx.session.phaseEndsAt && ctx.session.phaseEndsAt <= new Date()) await expirePhase(ctx);
    }).catch((err) => logError("bot", err, row.guildId));
  }

  const finished = await prisma.matchSession.findMany({ where: { closedAt: null, phase: "DONE", kind: "SINGLE", setup: { useTimers: true }, doneAt: { lte: new Date(now.getTime() - DONE_RESET_MS) } }, take: 20 });
  for (const row of finished) {
    await withLock(row.setupId, async () => {
      const ctx = await loadCtx(client, row.setupId);
      if (!ctx || ctx.session.id !== row.id) return;
      await replaceSession(ctx);
      await save(ctx, "SIGNUP");
    }).catch((err) => logError("bot", err, row.guildId));
  }

  const tournaments = await prisma.matchSession.findMany({ where: { closedAt: null, phase: "DONE", kind: "TOURNAMENT" }, include: { setup: true }, take: 20 });
  for (const row of tournaments) {
    const hours = row.setup.useTimers ? row.setup.autoReopenHours : 0;
    if (!hours || !row.doneAt || row.doneAt.getTime() + hours * 3_600_000 > now.getTime()) continue;
    await withLock(row.setupId, async () => {
      const ctx = await loadCtx(client, row.setupId);
      if (!ctx || ctx.session.id !== row.id) return;
      await replaceSession(ctx);
      await save(ctx, "SIGNUP");
    }).catch((err) => logError("bot", err, row.guildId));
  }
}

// ---- Dashboard actions (called from apps/api) ----

export async function refreshMatchPanel(client: Client, setupId: string) {
  await withLock(setupId, async () => {
    const ctx = await loadCtx(client, setupId);
    if (!ctx) return;
    if (ctx.session.phase === "SIGNUP") {
      const deadline = signupDeadline(ctx.setup);
      ctx.session = await prisma.matchSession.update({ where: { id: ctx.session.id }, data: { phaseEndsAt: ctx.setup.startMode === "SCHEDULED" || !ctx.state.signups.length ? deadline : ctx.session.phaseEndsAt ?? deadline } });
      if (ctx.state.eventId && ctx.setup.startMode === "SCHEDULED" && ctx.setup.startAt) {
        const event = await fetchEvent(ctx);
        await event?.edit({ scheduledStartTime: ctx.setup.startAt }).catch((err) => logError("bot", err, ctx.setup.guildId));
      }
    }
    await syncPanel(ctx);
  });
}

// Who's on each team, for staff, while rosters are hidden from players.
export async function matchRoster(client: Client, setupId: string): Promise<Array<{ team: string; players: string[] }>> {
  const ctx = await loadCtx(client, setupId);
  if (!ctx) return [];
  const { setup, session, state } = ctx;
  const guild = await client.guilds.fetch(setup.guildId).catch(() => null);
  const name = async (id: string) => (await guild?.members.fetch(id).catch(() => null))?.displayName ?? id;
  if (state.teams.length) return Promise.all(state.teams.map(async (t) => ({ team: t.name, players: await Promise.all(t.players.map(name)) })));
  if (usesPicks(setup)) return Promise.all(Array.from({ length: slotCount(setup, session.kind) }, async (_, i) => ({ team: slotName(setup, session.kind, i), players: await Promise.all(onTeam(state, i).map(name)) })));
  return [{ team: "Registered", players: await Promise.all(state.signups.map(name)) }];
}

export async function cancelMatch(client: Client, setupId: string) {
  await withLock(setupId, async () => {
    const ctx = await loadCtx(client, setupId);
    if (ctx) await cancelCtx(ctx);
  });
}

export async function closeMatchRooms(client: Client, setupId: string) {
  await withLock(setupId, async () => {
    const ctx = await loadCtx(client, setupId);
    if (ctx) await closeTeamRooms(ctx);
  });
}

export async function voidMatchResult(client: Client, resultId: string): Promise<boolean> {
  const result = await prisma.matchResult.findUnique({ where: { id: resultId }, include: { setup: true } });
  if (!result || result.voided) return false;
  const { setup } = result;
  if (!setup) {
    await prisma.matchResult.update({ where: { id: result.id }, data: { voided: true } });
    await syncBoard(client, result.guildId, result.game);
    return true;
  }
  await withLock(setup.id, async () => {
    const economyOn = await isModuleEnabled(setup.guildId, "ECONOMY");
    const economy = economyOn ? await getConfig(setup.guildId) : null;
    const undo = async (ids: string[], won: boolean) => {
      const coins = won ? result.winCoins : result.lossCoins;
      for (const userId of ids) {
        const player: MatchPlayer | null = await prisma.matchPlayer.findUnique({ where: { setupId_userId: { setupId: setup.id, userId } } });
        if (!player) continue;
        await prisma.matchPlayer.update({
          where: { id: player.id },
          data: {
            rating: { decrement: ratingChange(won) },
            wins: Math.max(0, player.wins - (won ? 1 : 0)),
            losses: Math.max(0, player.losses - (won ? 0 : 1)),
            coinsEarned: Math.max(0, player.coinsEarned - coins),
            streak: won ? Math.max(0, player.streak - 1) : player.streak,
          },
        });
        if (economy && coins > 0) await addBalance(setup.guildId, userId, -coins, "match_void", economy.maxBalance);
      }
    };
    await undo(stringList(result.winners), true);
    await undo(stringList(result.losers), false);
    await prisma.matchResult.update({ where: { id: result.id }, data: { voided: true } });
    await syncBoard(client, setup.guildId, result.game);
  });
  return true;
}
