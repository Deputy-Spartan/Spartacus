import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type MessageActionRowComponentBuilder,
  type StringSelectMenuInteraction,
} from "discord.js";
import { Prisma, type MatchRoom, type MatchTeam, type MatchTournament, type MatchTournamentEntry, type MatchmakingConfig } from "@prisma/client";
import { logError } from "@spartacus/db";
import {
  TOURNAMENT_BEST_OF,
  advanceTie,
  buildTournamentBracket,
  readBracket,
  readyTies,
  roundName,
  tieBestOf,
  type TournamentBestOf,
  type TournamentBracket,
} from "@spartacus/shared";
import { prisma } from "../../lib/prisma";
import { isSendableChannel } from "../../lib/channels";
import { isModuleEnabled } from "../../lib/moduleGate";
import { addBalance, getConfig as economyConfig } from "../../lib/economy";
import { withLock } from "./lock";
import { shuffle } from "./engine";
import { stringList } from "./render";
import { closeRoom, openRoom, presetFor, syncMatchmakingPanel, teamSizeFor } from "./matchmaking";

// Matchmaking tournaments. Teams people already made in Matchmaking register
// as they are (solo players are put into teams at the start), the bracket is
// seeded by match record, and every match in a round runs at once as a normal
// match room. Results come back through tournamentMatchDone.
//
// Everything runs under the same lock as Matchmaking (mm:<guild>), so rooms
// and the bracket never disagree. Functions marked "(locked)" take the lock;
// the rest expect to already be inside it.

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;
type Tournament = MatchTournament & { entries: MatchTournamentEntry[] };
const GOLD = 0xf1c40f;
const CHAMPION_DAYS = 7;
const lock = (guildId: string) => <T>(run: () => Promise<T>) => withLock(`mm:${guildId}`, run);
const row = (...items: MessageActionRowComponentBuilder[]) => new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...items);
const button = (id: string, label: string, style: ButtonStyle) => new ButtonBuilder().setCustomId(id).setLabel(label.slice(0, 80)).setStyle(style);
const mentions = (ids: string[]) => ids.map((id) => `<@${id}>`).join(" ");
const active = (t: Tournament) => t.entries.filter((e) => !e.out);
const at = (d: Date, style = "F") => `<t:${Math.floor(d.getTime() / 1000)}:${style}>`;

async function load(id: string): Promise<Tournament | null> {
  return prisma.matchTournament.findUnique({ where: { id }, include: { entries: { orderBy: { createdAt: "asc" } } } });
}

async function save(t: Tournament, data: Prisma.MatchTournamentUpdateInput): Promise<Tournament> {
  return prisma.matchTournament.update({ where: { id: t.id }, data, include: { entries: { orderBy: { createdAt: "asc" } } } });
}

const saveBracket = (t: Tournament, bracket: TournamentBracket, extra: Prisma.MatchTournamentUpdateInput = {}) => save(t, { bracket: bracket as unknown as Prisma.InputJsonValue, ...extra });

function channelFor(t: MatchTournament, config: MatchmakingConfig | null): string | null {
  return t.channelId ?? config?.tournamentChannelId ?? config?.activityChannelId ?? config?.channelId ?? null;
}

async function send(client: Client, t: MatchTournament, content: string, users: string[] = [], roles: string[] = []) {
  const config = await prisma.matchmakingConfig.findUnique({ where: { guildId: t.guildId } });
  const id = channelFor(t, config);
  const channel = id ? await client.channels.fetch(id).catch(() => null) : null;
  if (!isSendableChannel(channel)) return;
  await channel.send({ content: content.slice(0, 2000), allowedMentions: { users, roles } }).catch((err) => logError("bot", err, t.guildId));
}

async function dm(client: Client, userIds: string[], content: string) {
  for (const id of userIds) {
    const user = await client.users.fetch(id).catch(() => null);
    await user?.send({ content: content.slice(0, 2000) }).catch(() => null);
  }
}

// Win-loss for a team name in this game, from Matchmaking results.
async function records(guildId: string, game: string, names: string[]): Promise<Record<string, { w: number; l: number }>> {
  const rows = await prisma.matchResult.findMany({
    where: { guildId, game, voided: false, OR: [{ winnerTeam: { in: names } }, { loserTeam: { in: names } }] },
    select: { winnerTeam: true, loserTeam: true },
  });
  const out: Record<string, { w: number; l: number }> = Object.fromEntries(names.map((n) => [n, { w: 0, l: 0 }]));
  for (const r of rows) {
    if (r.winnerTeam && out[r.winnerTeam]) out[r.winnerTeam].w++;
    if (r.loserTeam && out[r.loserTeam]) out[r.loserTeam].l++;
  }
  return out;
}

// ---- The post ----

function tieLine(t: Tournament, tie: TournamentBracket[number][number], r: number, live: Map<string, MatchRoom>): string {
  const e = (id: string | null) => (id ? t.entries.find((x) => x.id === id) : null);
  const label = (id: string | null) => {
    const entry = e(id);
    return entry ? `\`${entry.seed ?? "-"}\` ${entry.name}` : r === 0 ? "*bye*" : "*TBD*";
  };
  if (tie.w) {
    const loser = tie.w === tie.a ? tie.b : tie.a;
    if (!loser) return `⏩ **${label(tie.w)}** (bye)`;
    const ws = tie.w === tie.a ? tie.sa : tie.sb;
    const ls = tie.w === tie.a ? tie.sb : tie.sa;
    return `✅ **${label(tie.w)}** ${tie.forfeit ? "(staff call)" : `${ws}–${ls}`} ${label(loser)}`;
  }
  const room = tie.roomId ? live.get(tie.roomId) : null;
  if (room) return `🔴 ${label(tie.a)} vs ${label(tie.b)}${room.threadId ? ` · <#${room.threadId}>` : ""}`;
  return `⏳ ${label(tie.a)} vs ${label(tie.b)}`;
}

function bracketFields(t: Tournament, bracket: TournamentBracket, live: Map<string, MatchRoom>) {
  const fields: Array<{ name: string; value: string }> = [];
  bracket.forEach((ties, r) => {
    const lines = ties.map((tie) => tieLine(t, tie, r, live));
    const name = `${roundName(bracket, r)} · Best of ${tieBestOf(t.bestOf, bracket, r)}`;
    let chunk: string[] = [];
    let part = 0;
    const flush = () => {
      if (!chunk.length) return;
      fields.push({ name: part++ ? `${name} (cont.)` : name, value: chunk.join("\n") });
      chunk = [];
    };
    for (const line of lines) {
      if ([...chunk, line].join("\n").length > 1000) flush();
      chunk.push(line);
    }
    flush();
  });
  return fields.slice(0, 25);
}

async function buildPost(t: Tournament) {
  const preset = await presetFor(t.guildId, t.game);
  const size = teamSizeFor(preset);
  const embed = new EmbedBuilder().setColor(GOLD).setTitle(`🏆 ${t.name}`.slice(0, 256));
  const when = t.startAt ? `📅 ${at(t.startAt)} (${at(t.startAt, "R")})` : "📅 Starts when staff start it";
  const rewards = [t.championCoins ? `${t.championCoins} coins each` : "", t.championRoleId ? "the Champion role for a week" : ""].filter(Boolean).join(" + ");
  const about = [
    `**${t.game}** · ${size}v${size} · Single elimination · ${TOURNAMENT_BEST_OF[t.bestOf as TournamentBestOf] ?? t.bestOf}`,
    when + (t.checkIn && t.status === "OPEN" ? ` · check-in opens ${t.checkInMinutes} min before` : ""),
    rewards ? `👑 Champions get ${rewards}` : "",
  ].filter(Boolean);
  const rows: Row[] = [];
  const entries = active(t);
  const solo = stringList(t.solo);

  if (t.status === "OPEN") {
    const recs = await records(t.guildId, t.game, entries.map((e) => e.name));
    embed.setDescription([...about, "", "Captains: tap **Register my team** to enter a team you made in Matchmaking. Everyone on it comes along."].join("\n"));
    embed.addFields({
      name: `Teams ${entries.length}/${t.maxTeams}`,
      value: entries.map((e) => `• **${e.name}** (${recs[e.name]?.w ?? 0}-${recs[e.name]?.l ?? 0}) · 👑 <@${e.captainId}>`).join("\n").slice(0, 1024) || "No teams yet. Be the first!",
    });
    if (t.soloSignups) embed.addFields({ name: `Solo players ${solo.length}`, value: (solo.length ? mentions(solo) : "No team? Tap **Solo sign-up** and you'll be put on a team when it starts.").slice(0, 1024) });
    const buttons = [button(`mmt:${t.id}:reg`, "🛡️ Register my team", ButtonStyle.Success), button(`mmt:${t.id}:out`, "Withdraw my team", ButtonStyle.Danger)];
    if (t.soloSignups) buttons.splice(1, 0, button(`mmt:${t.id}:solo`, "🎲 Solo sign-up", ButtonStyle.Secondary));
    rows.push(row(...buttons));
  } else if (t.status === "CHECKIN") {
    const ready = stringList(t.soloReady);
    embed.setColor(0x3ba55d).setDescription([...about, "", `✅ **Check-in is open.** Captains (and solo players) tap **Check in**${t.checkInEndsAt ? ` before ${at(t.checkInEndsAt, "t")} (${at(t.checkInEndsAt, "R")})` : ""}. Anyone who doesn't is taken out so nobody waits on a no-show.`].join("\n"));
    embed.addFields({ name: "Teams", value: entries.map((e) => `${e.checkedIn ? "✅" : "⏳"} **${e.name}** · 👑 <@${e.captainId}>`).join("\n").slice(0, 1024) || "No teams" });
    if (solo.length) embed.addFields({ name: "Solo players", value: solo.map((id) => `${ready.includes(id) ? "✅" : "⏳"} <@${id}>`).join(" ").slice(0, 1024) });
    rows.push(row(button(`mmt:${t.id}:in`, "✅ Check in", ButtonStyle.Success)));
  } else if (t.status === "LIVE" || t.status === "DONE") {
    const bracket = readBracket(t.bracket);
    const rooms = await prisma.matchRoom.findMany({ where: { tournamentId: t.id, status: { in: ["LIVE", "CONFIRM"] } } });
    const live = new Map(rooms.map((r) => [r.id, r]));
    if (t.status === "DONE") {
      const champ = t.entries.find((e) => e.id === t.championEntryId);
      embed.setDescription([`👑 **${champ?.name ?? "?"}** won the ${t.name}!`, champ ? mentions(stringList(champ.players)) : "", "", ...about].join("\n"));
    } else {
      embed.setDescription([...about, "", "🔴 Live matches have their own thread and voice channels. Captains report the score there; winners move on by themselves."].join("\n"));
    }
    embed.addFields(...bracketFields(t, bracket, live));
  } else if (t.status === "CANCELED") {
    embed.setColor(0x4e5058).setDescription("This tournament was canceled.");
  }
  if (t.rules && (t.status === "OPEN" || t.status === "CHECKIN")) embed.addFields({ name: "📜 Rules", value: t.rules.slice(0, 1024) });
  return { embeds: [embed], components: rows };
}

export async function syncTournamentPost(client: Client, t: Tournament, ping = "", pingRole: string | null = t.pingRoleId) {
  if (t.status === "DRAFT") return;
  const config = await prisma.matchmakingConfig.findUnique({ where: { guildId: t.guildId } });
  const id = channelFor(t, config);
  const channel = id ? await client.channels.fetch(id).catch(() => null) : null;
  if (!isSendableChannel(channel)) return;
  const post = await buildPost(t);
  if (t.messageId) {
    const message = await channel.messages.fetch(t.messageId).catch(() => null);
    if (message && (await message.edit(post).catch(() => null))) return;
  }
  const sent = await channel.send({ ...post, content: ping || undefined, allowedMentions: { roles: pingRole ? [pingRole] : [] } }).catch((err) => {
    logError("bot", err, t.guildId);
    return null;
  });
  if (sent) await prisma.matchTournament.update({ where: { id: t.id }, data: { messageId: sent.id } });
}

// ---- Phases ----

async function openCheckIn(client: Client, t: Tournament): Promise<Tournament> {
  const ends = t.startAt && t.startAt > new Date() ? t.startAt : new Date(Date.now() + t.checkInMinutes * 60_000);
  t = await save(t, { status: "CHECKIN", checkInEndsAt: ends, soloReady: [] });
  await prisma.matchTournamentEntry.updateMany({ where: { tournamentId: t.id }, data: { checkedIn: false } });
  t = (await load(t.id))!;
  await syncTournamentPost(client, t);
  const captains = active(t).map((e) => e.captainId);
  const solo = stringList(t.solo);
  await send(client, t, `✅ **Check-in for ${t.name} is open** until ${at(ends, "t")}. ${mentions([...captains, ...solo])} tap **Check in** on the tournament post.`, [...captains, ...solo]);
  await dm(client, captains, `✅ Check-in for **${t.name}** is open until ${at(ends, "t")}. Tap **Check in** on the tournament post in the server, or your team is taken out.`);
  return t;
}

// Players without a team, plus Looking for a Team players to fill the gaps,
// made into teams of the right size.
async function soloTeams(t: Tournament, size: number): Promise<{ teams: string[][]; left: string[] }> {
  const taken = new Set(active(t).flatMap((e) => stringList(e.players)));
  const pool = stringList(t.solo).filter((id) => !taken.has(id));
  if (!pool.length) return { teams: [], left: [] };
  if (pool.length % size) {
    const lft = await prisma.matchQueue.findMany({ where: { guildId: t.guildId, game: t.game, kind: "LFT" }, orderBy: { joinedAt: "asc" } });
    for (const q of lft) {
      if (pool.length % size === 0) break;
      if (!taken.has(q.userId) && !pool.includes(q.userId)) pool.push(q.userId);
    }
  }
  const mixed = shuffle(pool);
  const teams: string[][] = [];
  while (mixed.length >= size) teams.push(mixed.splice(0, size));
  return { teams, left: mixed };
}

async function startTournament(client: Client, t: Tournament): Promise<string | null> {
  const config = await prisma.matchmakingConfig.findUnique({ where: { guildId: t.guildId } });
  if (!config) return "Matchmaking isn't set up yet.";
  if (t.status === "CHECKIN") {
    await prisma.matchTournamentEntry.updateMany({ where: { tournamentId: t.id, checkedIn: false, out: false }, data: { out: true } });
    const missed = active(t).filter((e) => !e.checkedIn);
    const ready = stringList(t.soloReady);
    const missedSolo = stringList(t.solo).filter((id) => !ready.includes(id));
    t = await save(t, { solo: ready });
    if (missed.length || missedSolo.length) {
      await send(client, t, `⏹️ Didn't check in, so they're out: ${[...missed.map((e) => `**${e.name}**`), ...missedSolo.map((id) => `<@${id}>`)].join(", ")}.`);
    }
  }
  const size = teamSizeFor(await presetFor(t.guildId, t.game));
  const room = t.maxTeams - active(t).length;
  const { teams, left } = await soloTeams(t, size);
  const made = teams.slice(0, Math.max(0, room));
  const sittingOut = [...left, ...teams.slice(made.length).flat()];
  for (let i = 0; i < made.length; i++) {
    await prisma.matchTournamentEntry.create({ data: { tournamentId: t.id, name: `Solo Squad ${i + 1}`, captainId: made[i][0], players: made[i], checkedIn: true } });
  }
  if (made.length) await send(client, t, `🎲 Solo players were put into ${made.length} team${made.length > 1 ? "s" : ""}: ${made.map((p, i) => `**Solo Squad ${i + 1}** (👑 <@${p[0]}>)`).join(", ")}.`, made.flat());
  if (sittingOut.length) await send(client, t, `${mentions(sittingOut)} There weren't enough solo players for another full team this time, sorry! You're first in line next time.`, sittingOut);

  t = (await load(t.id))!;
  const entries = active(t);
  if (entries.length < 2) {
    t = await save(t, { status: "CANCELED", endedAt: new Date() });
    await syncTournamentPost(client, t);
    await send(client, t, `**${t.name}** needed at least 2 teams, so it was canceled.`);
    return "It needs at least 2 teams, so it was canceled.";
  }
  let order = entries;
  if (t.seeding === "RECORD") {
    const recs = await records(t.guildId, t.game, entries.map((e) => e.name));
    const rate = (e: MatchTournamentEntry) => {
      const r = recs[e.name] ?? { w: 0, l: 0 };
      return r.w + r.l ? r.w / (r.w + r.l) : 0;
    };
    order = shuffle(entries).sort((x, y) => rate(y) - rate(x) || (recs[y.name]?.w ?? 0) - (recs[x.name]?.w ?? 0));
  } else order = shuffle(entries);
  for (let i = 0; i < order.length; i++) await prisma.matchTournamentEntry.update({ where: { id: order[i].id }, data: { seed: i + 1 } });
  const bracket = buildTournamentBracket(order.map((e) => e.id));
  t = (await load(t.id))!;
  t = await saveBracket(t, bracket, { status: "LIVE", startedAt: new Date() });
  const byes = bracket[0].filter((x) => !x.a || !x.b).length;
  await launchReady(client, t, config);
  t = (await load(t.id))!;
  await syncTournamentPost(client, t);
  await send(
    client,
    t,
    `🏆 **${t.name} has started!** ${entries.length} teams, seeded by ${t.seeding === "RECORD" ? "match record" : "random draw"}.${byes ? ` ${byes} top seed${byes > 1 ? "s get" : " gets"} a bye into round 2.` : ""} Every round-1 match is live now: check your match thread.`
  );
  return null;
}

// Opens a match room for every tie whose two teams are known.
async function launchReady(client: Client, t: Tournament, config: MatchmakingConfig) {
  const bracket = readBracket(t.bracket);
  for (const [r, i] of readyTies(bracket)) {
    const tie = bracket[r][i];
    const a = t.entries.find((e) => e.id === tie.a)!;
    const b = t.entries.find((e) => e.id === tie.b)!;
    const bo = tieBestOf(t.bestOf, bracket, r);
    const kind = a.teamId && b.teamId ? "TEAM" : "PICKUP";
    const note = `🏆 **${t.name}** · ${roundName(bracket, r)} · Best of ${bo}${bo === 3 ? " (report games won: 2-0 or 2-1)" : ""}`;
    const room = await openRoom(
      client,
      config,
      kind,
      t.game,
      { name: a.name, players: stringList(a.players), captain: a.captainId },
      { name: b.name, players: stringList(b.players), captain: b.captainId },
      { tournamentId: t.id, tieRound: r, tieIndex: i, note }
    );
    tie.roomId = room.id;
  }
  await saveBracket(t, bracket);
}

async function payCoins(guildId: string, userIds: string[], amount: number, reason: string) {
  if (amount <= 0 || !(await isModuleEnabled(guildId, "ECONOMY"))) return;
  const economy = await economyConfig(guildId);
  for (const id of userIds) await addBalance(guildId, id, amount, reason, economy?.maxBalance).catch((err) => logError("bot", err, guildId));
}

async function crown(client: Client, t: Tournament, championId: string, runnerUpId: string | null) {
  t = await save(t, { status: "DONE", endedAt: new Date(), championEntryId: championId, runnerUpEntryId: runnerUpId });
  const champ = t.entries.find((e) => e.id === championId)!;
  const runner = t.entries.find((e) => e.id === runnerUpId);
  const champs = stringList(champ.players);
  await payCoins(t.guildId, champs, t.championCoins, "tournament_champion");
  if (runner) await payCoins(t.guildId, stringList(runner.players), t.runnerUpCoins, "tournament_runner_up");
  const config = await prisma.matchmakingConfig.findUnique({ where: { guildId: t.guildId } });
  const roleId = t.championRoleId ?? config?.championRoleId ?? null;
  if (roleId) {
    const guild = await client.guilds.fetch(t.guildId).catch(() => null);
    const expiresAt = new Date(Date.now() + CHAMPION_DAYS * 86_400_000);
    for (const id of champs) {
      const member = await guild?.members.fetch(id).catch(() => null);
      if (!member) continue;
      await member.roles.add(roleId, `${t.name} champion`).catch((err) => logError("bot", err, t.guildId));
      await prisma.economyTimedRole.upsert({ where: { guildId_userId_roleId: { guildId: t.guildId, userId: id, roleId } }, create: { guildId: t.guildId, userId: id, roleId, expiresAt }, update: { expiresAt } });
    }
  }
  await syncTournamentPost(client, t);
  const lines = [
    `👑 **${champ.name} win the ${t.name}!** ${mentions(champs)}`,
    [t.championCoins ? `+${t.championCoins} coins each` : "", roleId ? `<@&${roleId}> for a week` : ""].filter(Boolean).join(" · "),
    runner ? `🥈 Runner-up: **${runner.name}**${t.runnerUpCoins ? ` (+${t.runnerUpCoins} coins each)` : ""}` : "",
  ].filter(Boolean);
  await send(client, t, lines.join("\n"), champs);
}

// Called by finishRoom (already inside the lock) when a tournament match ends.
export async function tournamentMatchDone(client: Client, room: MatchRoom) {
  if (!room.tournamentId || room.tieRound === null || room.tieIndex === null) return;
  let t = await load(room.tournamentId);
  if (!t || t.status !== "LIVE") return;
  const bracket = readBracket(t.bracket);
  const tie = bracket[room.tieRound]?.[room.tieIndex];
  if (!tie || tie.w || tie.roomId !== room.id || !tie.a || !tie.b) return;
  const winner = room.reportSide === "a" ? tie.a : tie.b;
  const loser = winner === tie.a ? tie.b : tie.a;
  const final = advanceTie(bracket, room.tieRound, room.tieIndex, winner, room.reportHigh, room.reportLow);
  t = await saveBracket(t, bracket);
  await payCoins(t.guildId, stringList(t.entries.find((e) => e.id === winner)?.players), t.winCoins, "tournament_win");
  if (final) return crown(client, t, winner, loser);
  await afterTie(client, t);
}

async function afterTie(client: Client, t: Tournament) {
  const config = await prisma.matchmakingConfig.findUnique({ where: { guildId: t.guildId } });
  if (config) await launchReady(client, t, config);
  t = (await load(t.id))!;
  await syncTournamentPost(client, t);
}

// ---- Discord buttons (mmt:<id>:<action>, mmtreg:<id>) ----

async function register(client: Client, t: Tournament, team: MatchTeam): Promise<string> {
  if (t.status !== "OPEN") return "Registration is closed.";
  if (team.game !== t.game) return `That team plays ${team.game}, not ${t.game}.`;
  const entries = active(t);
  if (entries.some((e) => e.teamId === team.id)) return `**${team.name}** is already registered.`;
  if (entries.length >= t.maxTeams) return `The tournament is full (${t.maxTeams} teams).`;
  const size = teamSizeFor(await presetFor(t.guildId, t.game));
  const players = stringList(team.players);
  if (players.length < size) return `**${team.name}** has ${players.length} of ${size} players. Fill the roster from **My Teams** on the Matchmaking board first.`;
  const clash = entries.find((e) => stringList(e.players).some((id) => players.includes(id)));
  if (clash) return `Someone on **${team.name}** is already playing for **${clash.name}** in this tournament.`;
  await prisma.matchTournamentEntry.create({ data: { tournamentId: t.id, teamId: team.id, name: team.name, captainId: team.captainId, players } });
  await prisma.matchTournament.update({ where: { id: t.id }, data: { solo: stringList(t.solo).filter((id) => !players.includes(id)) } });
  await syncTournamentPost(client, (await load(t.id))!);
  await dm(client, players.filter((id) => id !== team.captainId), `🛡️ **${team.name}** is registered for **${t.name}** (${t.game})${t.startAt ? `, starting ${at(t.startAt)}` : ""}. Good luck!`);
  return `✅ **${team.name}** is registered for **${t.name}**. Your players got a DM.`;
}

export async function handleTournament(interaction: ButtonInteraction | StringSelectMenuInteraction) {
  const guildId = interaction.guildId!;
  const { client, user } = interaction;
  const [prefix, id, action] = interaction.customId.split(":");
  await interaction.deferReply({ ephemeral: true });
  const reply = await lock(guildId)(async (): Promise<string | { content: string; components: Row[] }> => {
    const t = await load(id);
    if (!t || t.guildId !== guildId) return "This tournament no longer exists.";
    if (prefix === "mmtreg" && interaction.isStringSelectMenu()) {
      const team = await prisma.matchTeam.findUnique({ where: { id: interaction.values[0] } });
      if (!team || team.guildId !== guildId || team.captainId !== user.id) return "Only the team's captain can register it.";
      return register(client, t, team);
    }
    if (action === "reg") {
      if (t.status !== "OPEN") return "Registration is closed.";
      const teams = await prisma.matchTeam.findMany({ where: { guildId, game: t.game, captainId: user.id } });
      if (!teams.length) return `You don't captain a ${t.game} team. Make one with **Create Team** on the Matchmaking board${t.soloSignups ? ", or tap **Solo sign-up** here" : ""}.`;
      if (teams.length === 1) return register(client, t, teams[0]);
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`mmtreg:${t.id}`)
        .setPlaceholder("Pick the team to register")
        .addOptions(teams.slice(0, 25).map((tm) => ({ label: tm.name.slice(0, 100), value: tm.id, description: `${stringList(tm.players).length} players` })));
      return { content: "Which team?", components: [row(menu)] };
    }
    if (action === "out") {
      if (t.status !== "OPEN" && t.status !== "CHECKIN") return "The tournament has already started.";
      const entry = active(t).find((e) => e.captainId === user.id);
      if (!entry) return "You don't captain a team in this tournament.";
      await prisma.matchTournamentEntry.delete({ where: { id: entry.id } });
      await syncTournamentPost(client, (await load(t.id))!);
      return `**${entry.name}** withdrew from **${t.name}**.`;
    }
    if (action === "solo") {
      if (t.status !== "OPEN") return "Sign-ups are closed.";
      if (!t.soloSignups) return "This tournament is teams only.";
      const solo = stringList(t.solo);
      if (solo.includes(user.id)) {
        await prisma.matchTournament.update({ where: { id: t.id }, data: { solo: solo.filter((x) => x !== user.id) } });
        await syncTournamentPost(client, (await load(t.id))!);
        return "You left the solo list.";
      }
      const onTeam = active(t).find((e) => stringList(e.players).includes(user.id));
      if (onTeam) return `You're already playing for **${onTeam.name}**.`;
      await prisma.matchTournament.update({ where: { id: t.id }, data: { solo: [...solo, user.id] } });
      await syncTournamentPost(client, (await load(t.id))!);
      return "🎲 You're on the solo list. When the tournament starts you'll be put on a team with other solo players. Tap again to leave.";
    }
    if (action === "in") {
      if (t.status !== "CHECKIN") return "Check-in isn't open.";
      const entry = active(t).find((e) => e.captainId === user.id);
      if (entry) {
        if (entry.checkedIn) return `**${entry.name}** is already checked in.`;
        await prisma.matchTournamentEntry.update({ where: { id: entry.id }, data: { checkedIn: true } });
        await syncTournamentPost(client, (await load(t.id))!);
        return `✅ **${entry.name}** is checked in.`;
      }
      const solo = stringList(t.solo);
      if (solo.includes(user.id)) {
        const ready = stringList(t.soloReady);
        if (!ready.includes(user.id)) await prisma.matchTournament.update({ where: { id: t.id }, data: { soloReady: [...ready, user.id] } });
        await syncTournamentPost(client, (await load(t.id))!);
        return "✅ You're checked in.";
      }
      const mine = active(t).find((e) => stringList(e.players).includes(user.id));
      return mine ? `Only your captain <@${mine.captainId}> checks in for **${mine.name}**.` : "You aren't registered for this tournament.";
    }
    return "That button is out of date.";
  });
  await interaction.editReply(typeof reply === "string" ? { content: reply, components: [] } : reply).catch(() => null);
}

// ---- Dashboard actions (locked) ----

export async function openTournament(client: Client, id: string): Promise<string | null> {
  const t0 = await load(id);
  if (!t0) return "That tournament no longer exists.";
  return lock(t0.guildId)(async () => {
    let t = (await load(id))!;
    if (t.status !== "DRAFT") return "It's already open.";
    const config = await prisma.matchmakingConfig.findUnique({ where: { guildId: t.guildId } });
    if (!channelFor(t, config)) return "Pick a channel for the tournament post first.";
    t = await save(t, { status: "OPEN" });
    const ping = t.pingRoleId ?? config?.alertsRoleId ?? null;
    await syncTournamentPost(client, t, ping ? `<@&${ping}> Registration is open!` : "", ping);
    t = (await load(id))!;
    return t.messageId ? null : "Registration is open, but I couldn't post in that channel. Check that I can send messages there.";
  });
}

export async function tournamentCheckIn(client: Client, id: string): Promise<string | null> {
  const t0 = await load(id);
  if (!t0) return "That tournament no longer exists.";
  return lock(t0.guildId)(async () => {
    const t = (await load(id))!;
    if (t.status !== "OPEN") return "Check-in can only open while registration is open.";
    await openCheckIn(client, t);
    return null;
  });
}

export async function startTournamentNow(client: Client, id: string): Promise<string | null> {
  const t0 = await load(id);
  if (!t0) return "That tournament no longer exists.";
  return lock(t0.guildId)(async () => {
    const t = (await load(id))!;
    if (t.status !== "OPEN" && t.status !== "CHECKIN") return "It isn't waiting to start.";
    const problem = await startTournament(client, t);
    await syncMatchmakingPanel(client, t.guildId);
    return problem;
  });
}

// Staff call: one side wins a tie without a played score (no-show, dispute).
export async function setTieWinner(client: Client, id: string, r: number, i: number, side: "a" | "b"): Promise<string | null> {
  const t0 = await load(id);
  if (!t0) return "That tournament no longer exists.";
  return lock(t0.guildId)(async () => {
    let t = (await load(id))!;
    if (t.status !== "LIVE") return "The tournament isn't live.";
    const bracket = readBracket(t.bracket);
    const tie = bracket[r]?.[i];
    if (!tie?.a || !tie.b || tie.w) return "That match can't be decided right now.";
    const winner = side === "a" ? tie.a : tie.b;
    const loser = side === "a" ? tie.b : tie.a;
    const name = t.entries.find((e) => e.id === winner)?.name ?? "That team";
    if (tie.roomId) {
      const room = await prisma.matchRoom.findUnique({ where: { id: tie.roomId } });
      if (room && (room.status === "LIVE" || room.status === "CONFIRM")) {
        const closed = await prisma.matchRoom.update({ where: { id: room.id }, data: { status: "CANCELED", voiceIds: [], expiresAt: null } });
        await closeRoom(client, { ...closed, voiceIds: room.voiceIds }, `Staff set **${name}** as the winner of this match.`);
      }
    }
    const final = advanceTie(bracket, r, i, winner, null, null, true);
    t = await saveBracket(t, bracket);
    await send(client, t, `🛡️ Staff call: **${name}** goes through (${roundName(bracket, r)}).`);
    if (final) await crown(client, t, winner, loser);
    else await afterTie(client, t);
    await syncMatchmakingPanel(client, t.guildId);
    return null;
  });
}

export async function removeTournamentEntry(client: Client, id: string, entryId: string): Promise<string | null> {
  const t0 = await load(id);
  if (!t0) return "That tournament no longer exists.";
  return lock(t0.guildId)(async () => {
    const t = (await load(id))!;
    if (t.status !== "OPEN" && t.status !== "CHECKIN") return "Teams can only be removed before it starts. Once it's live, set the other team as the winner instead.";
    await prisma.matchTournamentEntry.deleteMany({ where: { id: entryId, tournamentId: id } });
    await syncTournamentPost(client, (await load(id))!);
    return null;
  });
}

async function closeLiveRooms(client: Client, t: Tournament, note: string) {
  const rooms = await prisma.matchRoom.findMany({ where: { tournamentId: t.id, status: { in: ["LIVE", "CONFIRM"] } } });
  for (const room of rooms) {
    const closed = await prisma.matchRoom.update({ where: { id: room.id }, data: { status: "CANCELED", voiceIds: [], expiresAt: null } });
    await closeRoom(client, { ...closed, voiceIds: room.voiceIds }, note);
  }
}

export async function cancelTournament(client: Client, id: string): Promise<string | null> {
  const t0 = await load(id);
  if (!t0) return "That tournament no longer exists.";
  return lock(t0.guildId)(async () => {
    let t = (await load(id))!;
    if (t.status === "DONE" || t.status === "CANCELED") return null;
    await closeLiveRooms(client, t, "The tournament was canceled, so this match is closed.");
    const wasDraft = t.status === "DRAFT";
    t = await save(t, { status: "CANCELED", endedAt: new Date() });
    if (!wasDraft) {
      await syncTournamentPost(client, t);
      await send(client, t, `**${t.name}** was canceled.`);
    }
    await syncMatchmakingPanel(client, t.guildId);
    return null;
  });
}

// Removes the tournament and its post. A finished one is kept as history
// unless deleted on purpose.
export async function deleteTournament(client: Client, id: string) {
  const t0 = await load(id);
  if (!t0) return;
  await lock(t0.guildId)(async () => {
    const t = (await load(id))!;
    if (t.status === "LIVE") await closeLiveRooms(client, t, "The tournament was deleted, so this match is closed.");
    if (t.messageId) {
      const config = await prisma.matchmakingConfig.findUnique({ where: { guildId: t.guildId } });
      const channelId = channelFor(t, config);
      const channel = channelId ? await client.channels.fetch(channelId).catch(() => null) : null;
      if (isSendableChannel(channel)) await (await channel.messages.fetch(t.messageId).catch(() => null))?.delete().catch(() => null);
    }
    await prisma.matchTournament.delete({ where: { id } });
  });
}

// After a dashboard edit while registration is open.
export async function refreshTournament(client: Client, id: string) {
  const t0 = await load(id);
  if (!t0) return;
  await lock(t0.guildId)(async () => {
    const t = await load(id);
    if (t) await syncTournamentPost(client, t);
  });
}

// ---- Timer (from the match ticker) ----

export async function tickTournaments(client: Client) {
  const now = new Date();
  const due = await prisma.matchTournament.findMany({
    where: {
      OR: [
        { status: "OPEN", startAt: { not: null, lte: new Date(now.getTime() + 60 * 60_000) } },
        { status: "CHECKIN", checkInEndsAt: { lte: now } },
      ],
    },
    take: 20,
  });
  for (const row of due) {
    await lock(row.guildId)(async () => {
      const t = await load(row.id);
      if (!t) return;
      if (t.status === "OPEN" && t.startAt) {
        if (t.checkIn && t.startAt.getTime() - t.checkInMinutes * 60_000 <= Date.now()) await openCheckIn(client, t);
        else if (!t.checkIn && t.startAt <= new Date()) await startTournament(client, t);
      } else if (t.status === "CHECKIN" && t.checkInEndsAt && t.checkInEndsAt <= new Date()) {
        await startTournament(client, t);
        await syncMatchmakingPanel(client, t.guildId);
      }
    }).catch((err) => logError("bot", err, row.guildId));
  }
}

// Best of 3 matches are reported as games won.
export async function tournamentScoreProblem(room: MatchRoom, high: number, low: number): Promise<string | null> {
  if (!room.tournamentId || room.tieRound === null) return null;
  const t = await prisma.matchTournament.findUnique({ where: { id: room.tournamentId }, select: { bestOf: true, bracket: true } });
  if (!t) return null;
  if (tieBestOf(t.bestOf, readBracket(t.bracket), room.tieRound) === 3 && !(high === 2 && low <= 1)) return "This match is best of 3: report games won, 2-0 or 2-1.";
  return null;
}
