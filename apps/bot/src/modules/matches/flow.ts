import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
import { logError } from "@spartacus/db";
import { prisma } from "../../lib/prisma";
import { isSendableChannel } from "../../lib/channels";
import { isModuleEnabled } from "../../lib/moduleGate";
import { addBalance, getConfig } from "../../lib/economy";
import { awardAchievement } from "../../lib/achievements";
import {
  bracketTeamCount,
  buildBracket,
  currentTeams,
  draftSide,
  emptyState,
  mapPool,
  nextTie,
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
import { buildBracket as bracketEmbed, buildLeaderboard, buildPanel, buildResult, buildStats, stringList, type PlayerMap } from "./render";

const CONFIRM_MS = 5 * 60_000;
const DONE_RESET_MS = 30 * 60_000;
const POST_ERROR_GAP_MS = 10 * 60_000;
const lastPostError = new Map<string, number>();

type Reply = string | InteractionEditReplyOptions | null;

interface Ctx {
  client: Client;
  setup: MatchSetup;
  session: MatchSession;
  state: MatchState;
}

// Two people clicking at once would otherwise both load the same state and
// the second save would wipe the first, so each setup's actions run in turn.
const queues = new Map<string, Promise<unknown>>();
function withLock<T>(setupId: string, run: () => Promise<T>): Promise<T> {
  const next = (queues.get(setupId) ?? Promise.resolve()).then(run, run);
  queues.set(setupId, next.catch(() => null));
  return next;
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
  return { client, setup, session, state: readState(session) };
}

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

async function syncPanel({ client, setup, session, state }: Ctx) {
  const channel = await client.channels.fetch(setup.panelChannelId).catch(() => null);
  if (!isSendableChannel(channel)) return;
  const ids = [...new Set([...state.signups, ...state.teams.flatMap((t) => t.players), ...state.draftPool])];
  const payload = buildPanel(setup, session.kind, session.number, session.phase, session.phaseEndsAt, state, await fetchPlayers(setup, ids), await draftNames(client, setup, state));

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
const lobbySize = (setup: MatchSetup, kind: string) => setup.teamSize * (kind === "TOURNAMENT" ? setup.tournamentTeams : 2);

async function teamLabel(ctx: Ctx, players: string[], fallback: string): Promise<string> {
  if (ctx.setup.teamSize !== 1 || !players[0]) return fallback;
  const guild = await ctx.client.guilds.fetch(ctx.setup.guildId).catch(() => null);
  const member = await guild?.members.fetch(players[0]).catch(() => null);
  return member?.displayName ?? fallback;
}

// ---- Steps ----

async function closeSignups(ctx: Ctx) {
  if (ctx.session.kind === "TOURNAMENT") return startTournament(ctx);
  if (!ctx.setup.checkIn) return enterTeams(ctx);
  ctx.state.ready = [];
  const endsAt = new Date(Date.now() + ctx.setup.checkInSeconds * 1000);
  await ping(ctx, `${roleMention(ctx.setup)}${ctx.state.signups.map((id) => `<@${id}>`).join(" ")} Lobby is full. Check in on the panel.`.slice(0, 2000));
  await save(ctx, "CHECKIN", endsAt);
}

async function enterTeams(ctx: Ctx) {
  const { setup, state } = ctx;
  await clearPings(ctx);
  const perTeam = Math.floor(state.signups.length / 2);
  const ids = state.signups.slice(0, perTeam * 2);
  const ratings = await ratingsFor(setup, ids);

  if (setup.balance === "CAPTAINS" && perTeam > 1) {
    const first = pickCaptain(ids, ratings, setup.captainRule);
    const second = pickCaptain(ids.filter((id) => id !== first), ratings, setup.captainRule);
    state.teams = [
      { name: setup.team1Name, players: [first], captain: first },
      { name: setup.team2Name, players: [second], captain: second },
    ];
    state.draftPool = ids.filter((id) => id !== first && id !== second);
    state.draftPick = 0;
    return save(ctx, "DRAFT", new Date(Date.now() + setup.voteSeconds * 1000));
  }

  await buildTeams(ctx, ids, ratings);
  await save(ctx, "TEAMS");
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
  if (state.draftPool.length === 0) await save(ctx, "TEAMS");
  else await save(ctx, "DRAFT", new Date(Date.now() + ctx.setup.voteSeconds * 1000));
}

async function startTournament(ctx: Ctx): Promise<string | void> {
  const { setup, state } = ctx;
  const teamCount = bracketTeamCount(state.signups.length, setup.teamSize, setup.tournamentTeams);
  if (teamCount < 2) return `A bracket needs at least ${setup.teamSize * 2} players.`;
  const ids = shuffle(state.signups).slice(0, teamCount * setup.teamSize);
  const ratings = await ratingsFor(setup, ids);
  const split = splitTeams(ids, ratings, teamCount, setup.teamSize, setup.balance === "RANDOM" ? "RANDOM" : "BALANCED");
  state.teams = await Promise.all(
    split.map(async (players, i): Promise<MatchTeam> => ({ name: await teamLabel(ctx, players, `Team ${i + 1}`), players, captain: pickCaptain(players, ratings, setup.captainRule) }))
  );
  state.bracket = buildBracket(teamCount);
  state.tie = nextTie(state.bracket);
  await clearPings(ctx);
  await syncBracket(ctx, true);
  await startMapStep(ctx);
}

async function syncBracket(ctx: Ctx, fresh = false) {
  const { client, setup, state } = ctx;
  const channel = await client.channels.fetch(setup.resultsChannelId).catch(() => null);
  if (!isSendableChannel(channel)) return;
  const embed = bracketEmbed(setup, state);
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
  await save(ctx, "MAP", new Date(Date.now() + setup.voteSeconds * 1000));
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
  await save(ctx, "MAP", new Date(Date.now() + setup.voteSeconds * 1000));
}

async function goLive(ctx: Ctx, map: string | null, note: string | null) {
  const { setup, state } = ctx;
  state.map = map;
  state.mapNote = note;
  state.report = null;
  if (state.tie) state.bracket[state.tie[0]][state.tie[1]].map = map;
  await save(ctx, "LIVE");
  await moveToVoice(ctx);
  if (state.notInVoice.length) {
    const voice = setup.team1VoiceId ? ` Join <#${setup.team1VoiceId}> or <#${setup.team2VoiceId}>.` : "";
    await ping(ctx, `${state.notInVoice.map((id) => `<@${id}>`).join(" ")} Your match started.${voice}`.slice(0, 2000));
    await save(ctx, "LIVE");
  }
}

// A bot can only move someone already connected to voice. Everyone else is
// listed so the panel can ping them a link instead.
async function moveToVoice(ctx: Ctx) {
  const { client, setup, state } = ctx;
  state.notInVoice = [];
  const teams = currentTeams(state);
  if (!setup.autoMove || !teams || !setup.team1VoiceId || !setup.team2VoiceId) return;
  const guild = await client.guilds.fetch(setup.guildId).catch(() => null);
  if (!guild) return;
  const targets: Array<[MatchTeam, string]> = [[teams[0], setup.team1VoiceId], [teams[1], setup.team2VoiceId]];
  for (const [team, channelId] of targets) {
    for (const id of team.players) {
      const member = await guild.members.fetch({ user: id, force: true }).catch(() => null);
      if (!member?.voice.channelId) {
        state.notInVoice.push(id);
        continue;
      }
      await member.voice.setChannel(channelId).catch((err) => {
        logError("bot", err, setup.guildId);
        state.notInVoice.push(id);
      });
    }
  }
}

async function returnToLobby(ctx: Ctx, teams: [MatchTeam, MatchTeam] | null) {
  const { client, setup } = ctx;
  if (!setup.autoMove || !setup.lobbyVoiceId || !teams) return;
  const guild = await client.guilds.fetch(setup.guildId).catch(() => null);
  if (!guild) return;
  const teamRooms = [setup.team1VoiceId, setup.team2VoiceId];
  for (const id of [...teams[0].players, ...teams[1].players]) {
    const member = await guild.members.fetch({ user: id, force: true }).catch(() => null);
    if (member?.voice.channelId && teamRooms.includes(member.voice.channelId)) {
      await member.voice.setChannel(setup.lobbyVoiceId).catch((err) => logError("bot", err, setup.guildId));
    }
  }
}

async function payPlayers(ctx: Ctx, ids: string[], won: boolean) {
  const { client, setup } = ctx;
  const coins = won ? setup.winCoins : setup.lossCoins;
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
    if (won) await awardAchievement(client, setup.guildId, userId, `MATCH_FIRST_WIN:${setup.id}`, `First ${setup.game} match win`, setup.resultsChannelId).catch((err) => logError("bot", err, setup.guildId));
  }
}

async function finishMatch(ctx: Ctx, report: MatchReport) {
  const { client, setup, state, session } = ctx;
  const teams = currentTeams(state);
  if (!teams) return;
  await clearPings(ctx);
  const [winner, loser] = report.winner === "a" ? teams : [teams[1], teams[0]];
  await payPlayers(ctx, winner.players, true);
  await payPlayers(ctx, loser.players, false);
  const result = await prisma.matchResult.create({
    data: {
      setupId: setup.id,
      guildId: setup.guildId,
      sessionId: session.id,
      number: session.number,
      map: state.map,
      winnerName: winner.name,
      loserName: loser.name,
      winnerScore: report.winnerScore,
      loserScore: report.loserScore,
      winners: winner.players,
      losers: loser.players,
      winCoins: setup.winCoins,
      lossCoins: setup.lossCoins,
    },
  });
  const channel = await client.channels.fetch(setup.resultsChannelId).catch(() => null);
  if (isSendableChannel(channel)) await channel.send({ embeds: [buildResult(setup, result)], allowedMentions: { parse: [] } }).catch((err) => logError("bot", err, setup.guildId));
  await syncLeaderboard(client, setup);
  await returnToLobby(ctx, teams);

  if (state.tie) {
    const champion = recordTie(state.bracket, state.tie, report.winner, report.winnerScore, report.loserScore);
    state.tie = nextTie(state.bracket);
    await syncBracket(ctx);
    if (champion === null) return startMapStep(ctx);
    state.champion = champion;
    await crownChampion(ctx, state.teams[champion]);
  } else {
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
    await prisma.matchPlayer.update({ where: { setupId_userId: { setupId: setup.id, userId } }, data: { tournamentWins: { increment: 1 }, coinsEarned: { increment: setup.championCoins } } });
    if (economy && setup.championCoins > 0) await addBalance(setup.guildId, userId, setup.championCoins, "match_champion", economy.maxBalance);
    if (setup.championRoleId) {
      const member = await guild?.members.fetch(userId).catch(() => null);
      await member?.roles.add(setup.championRoleId).catch((err) => logError("bot", err, setup.guildId));
    }
  }
  await syncLeaderboard(client, setup);
}

async function syncLeaderboard(client: Client, setup: MatchSetup) {
  const channel = await client.channels.fetch(setup.resultsChannelId).catch(() => null);
  if (!isSendableChannel(channel)) return;
  const rows = await prisma.matchPlayer.findMany({ where: { setupId: setup.id, OR: [{ wins: { gt: 0 } }, { losses: { gt: 0 } }] }, orderBy: [{ wins: "desc" }, { rating: "desc" }], take: 15 });
  const embed = buildLeaderboard(setup, rows);
  if (setup.leaderboardMessageId) {
    const message = await channel.messages.fetch(setup.leaderboardMessageId).catch(() => null);
    if (await message?.edit({ embeds: [embed] }).catch(() => null)) return;
  }
  const sent = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch((err) => {
    logError("bot", err, setup.guildId);
    return null;
  });
  if (!sent) return;
  await sent.pin().catch(() => null);
  setup.leaderboardMessageId = sent.id;
  await prisma.matchSetup.update({ where: { id: setup.id }, data: { leaderboardMessageId: sent.id } });
}

async function replaceSession(ctx: Ctx, signups: string[] = []) {
  await clearPings(ctx);
  await prisma.matchSession.update({ where: { id: ctx.session.id }, data: { closedAt: new Date(), phaseEndsAt: null, state: ctx.state as unknown as Prisma.InputJsonValue } });
  ctx.session = await openSession(ctx.setup, signups);
  ctx.state = readState(ctx.session);
}

async function expirePhase(ctx: Ctx) {
  const { session, state, setup } = ctx;
  if (session.phase === "CHECKIN") {
    state.signups = state.signups.filter((id) => state.ready.includes(id));
    await clearPings(ctx);
    if (state.signups.length >= lobbySize(setup, session.kind)) return enterTeams(ctx);
    await ping(ctx, `${roleMention(setup)}Not everyone checked in, so sign-ups are open again.`);
    return save(ctx, "SIGNUP");
  }
  if (session.phase === "DRAFT") {
    const ratings = await ratingsFor(setup, state.draftPool);
    return draftPick(ctx, pickCaptain(state.draftPool, ratings, "TOP"));
  }
  if (session.phase === "MAP") {
    if (setup.mapMethod === "BANS") return banMap(ctx, pickOne(state.mapOptions.filter((m) => !state.banned.includes(m))));
    return closeVote(ctx);
  }
  if (session.phase === "CONFIRM" && state.report) return finishMatch(ctx, state.report);
}

// ---- Member actions ----

function memberIsStaff(member: GuildMember | null, setup: MatchSetup): boolean {
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.ManageGuild) || (!!setup.staffRoleId && member.roles.cache.has(setup.staffRoleId));
}

const isCaptain = (ctx: Ctx, userId: string) => !!currentTeams(ctx.state)?.some((t) => t.captain === userId);

function rankPicker(setup: MatchSetup): InteractionEditReplyOptions {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`matchrank:${setup.id}`)
    .setPlaceholder("Your rank")
    .addOptions(stringList(setup.ranks).slice(0, 25).map((r, i) => ({ label: r.slice(0, 100), value: String(i) })));
  return { content: `Pick your ${setup.game} rank to continue. It's used to balance teams.`, components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)] };
}

async function join(ctx: Ctx, userId: string): Promise<Reply> {
  const { setup, session, state } = ctx;
  if (session.phase !== "SIGNUP") return "Sign-ups are closed for this match.";
  if (state.signups.includes(userId)) return "You're already in.";
  if (setup.useRanks) {
    const player = await prisma.matchPlayer.findUnique({ where: { setupId_userId: { setupId: setup.id, userId } } });
    if (player?.rank === null || player?.rank === undefined) return rankPicker(setup);
  }
  state.signups.push(userId);
  if (state.signups.length >= lobbySize(setup, session.kind)) await closeSignups(ctx);
  else await save(ctx, "SIGNUP");
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
    case "leave":
      if (session.phase !== "SIGNUP") return "You can't leave once sign-ups have closed. Ask staff to cancel the match.";
      if (!state.signups.includes(userId)) return "You aren't signed up.";
      state.signups = state.signups.filter((id) => id !== userId);
      await save(ctx, "SIGNUP");
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
      await clearPings(ctx);
      await ping(ctx, `${setup.staffRoleId ? `<@&${setup.staffRoleId}> ` : ""}A match result was disputed. Staff can report the correct score on the panel.`);
      await save(ctx, "LIVE");
      return "Result disputed. The match is back to live.";
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
    case "stats": {
      const player = await prisma.matchPlayer.findUnique({ where: { setupId_userId: { setupId: setup.id, userId } } });
      return { embeds: [buildStats(setup, player)] };
    }
    case "board": {
      const rows = await prisma.matchPlayer.findMany({ where: { setupId: setup.id, OR: [{ wins: { gt: 0 } }, { losses: { gt: 0 } }] }, orderBy: [{ wins: "desc" }, { rating: "desc" }], take: 15 });
      return { embeds: [buildLeaderboard(setup, rows)], allowedMentions: { parse: [] } };
    }
    case "staff": {
      if (!staff) return staffOnly;
      const buttons: ButtonBuilder[] = [];
      const add = (id: string, label: string, style = ButtonStyle.Primary) => buttons.push(new ButtonBuilder().setCustomId(`match:${setup.id}:${id}`).setLabel(label).setStyle(style));
      if (session.phase === "SIGNUP") add("force", "Start With Fewer");
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
      if (session.kind === "TOURNAMENT") return (await startTournament(ctx)) ?? "Bracket created.";
      await closeSignups(ctx);
      return "Starting with the players signed up.";
    case "skipcheck":
      if (!staff) return staffOnly;
      if (session.phase !== "CHECKIN") return "Check-in isn't running.";
      await enterTeams(ctx);
      return "Check-in skipped.";
    case "reroll": {
      if (!staff) return staffOnly;
      if (session.phase !== "TEAMS") return "Teams can only be rerolled before the match starts.";
      const ids = state.teams.flatMap((t) => t.players);
      await buildTeams(ctx, shuffle(ids), await ratingsFor(setup, ids));
      await save(ctx, "TEAMS");
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
  await returnToLobby(ctx, currentTeams(ctx.state));
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
  if (setup.reportBy === "STAFF" ? !staff : !staff && !isCaptain(ctx, interaction.user.id)) {
    return void interaction.reply({ content: setup.reportBy === "STAFF" ? "Only staff can report results." : "Only captains or staff can report results.", ephemeral: true });
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
      if (memberIsStaff(member ?? null, setup) || setup.reportBy !== "BOTH") {
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
  const setupId = interaction.customId.split(":")[1];
  const rank = Number(interaction.values[0]);
  await interaction.deferUpdate();
  try {
    const reply = await withLock(setupId, async () => {
      const ctx = await loadCtx(interaction.client, setupId);
      if (!ctx) return "This match setup no longer exists.";
      await setPlayerRank(ctx.setup, interaction.user.id, rank);
      return join(ctx, interaction.user.id);
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
    const action = { join: "join", leave: "leave", stats: "stats", leaderboard: "board" }[sub] ?? "stats";
    await respond(interaction, await withLock(setup.id, () => runAction(interaction.client, setup.id, action, undefined, interaction.user.id, member ?? null)));
  } catch (err) {
    logError("bot", err, interaction.guildId ?? undefined);
    await interaction.editReply(failed).catch(() => null);
  }
}

// ---- Timer ----

export async function tickMatches(client: Client) {
  const pending = await prisma.matchSetup.findMany({ where: { enabled: true, panelMessageId: null }, take: 10 });
  for (const setup of pending) {
    if (!(await isModuleEnabled(setup.guildId, "MATCHES"))) continue;
    await withLock(setup.id, async () => {
      const ctx = await loadCtx(client, setup.id);
      if (!ctx) return;
      await syncPanel(ctx);
      if (ctx.setup.panelMessageId && !ctx.setup.leaderboardMessageId) await syncLeaderboard(client, ctx.setup);
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

  const finished = await prisma.matchSession.findMany({ where: { closedAt: null, phase: "DONE", kind: "SINGLE", doneAt: { lte: new Date(now.getTime() - DONE_RESET_MS) } }, take: 20 });
  for (const row of finished) {
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
    if (ctx) await syncPanel(ctx);
  });
}

export async function cancelMatch(client: Client, setupId: string) {
  await withLock(setupId, async () => {
    const ctx = await loadCtx(client, setupId);
    if (ctx) await cancelCtx(ctx);
  });
}

export async function startMatchSeason(client: Client, setupId: string) {
  await withLock(setupId, async () => {
    const setup = await prisma.matchSetup.update({ where: { id: setupId }, data: { season: { increment: 1 } } });
    await prisma.matchPlayer.updateMany({ where: { setupId }, data: { wins: 0, losses: 0, streak: 0, tournamentWins: 0 } });
    await syncLeaderboard(client, setup);
  });
}

export async function voidMatchResult(client: Client, resultId: string): Promise<boolean> {
  const result = await prisma.matchResult.findUnique({ where: { id: resultId }, include: { setup: true } });
  if (!result || result.voided) return false;
  const { setup } = result;
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
    await syncLeaderboard(client, setup);
  });
  return true;
}
