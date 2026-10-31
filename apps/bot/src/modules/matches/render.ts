import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, type MessageActionRowComponentBuilder } from "discord.js";
import type { MatchPlayer, MatchResult, MatchSetup } from "@prisma/client";
import { resolveText, type MatchTextKey } from "@spartacus/shared";
import { currentTeams, draftSide, onTeam, teamSlotName, type BracketTie, type MatchState, type MatchTeam } from "./engine";

export type PlayerMap = Record<string, MatchPlayer | undefined>;
type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

const COLOR = { open: 0x7b99bc, live: 0x3ba55d, gold: 0xf0b232, bad: 0xed4245 };

// Applies the wording and colour saved on the Messages tab.
export function styleEmbed(embed: EmbedBuilder, texts: unknown, key: MatchTextKey, values: Record<string, string | number | null | undefined> = {}) {
  const t = resolveText(texts, key, values);
  embed.setColor(parseInt(t.color.slice(1), 16));
  embed.setTitle(t.title ? t.title.slice(0, 256) : null);
  embed.setDescription(t.description ? t.description.slice(0, 4096) : null);
  embed.setFooter(t.footer ? { text: t.footer.slice(0, 2048), iconURL: t.footerIcon || undefined } : null);
  embed.setURL(t.url || null);
  embed.setAuthor(t.authorName ? { name: t.authorName.slice(0, 256), iconURL: t.authorIcon || undefined } : null);
  embed.setThumbnail(t.thumbnail || null);
  embed.setImage(t.image || null);
  if (t.timestamp) embed.setTimestamp();
  if (t.fields.length) embed.addFields(t.fields.slice(0, 10));
  return embed;
}

export const stringList = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

const button = (setup: MatchSetup, action: string, label: string, style: ButtonStyle, arg?: string | number) =>
  new ButtonBuilder()
    .setCustomId(`match:${setup.id}:${action}${arg === undefined ? "" : `:${arg}`}`)
    .setLabel(label.slice(0, 80))
    .setStyle(style);

function rows(buttons: ButtonBuilder[]): Row[] {
  return Array.from({ length: Math.ceil(buttons.length / 5) }, (_, r) => new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(buttons.slice(r * 5, r * 5 + 5)));
}

function navRow(setup: MatchSetup, phase: string, say: (key: MatchTextKey) => string): Row {
  const picking = setup.joinMode === "PICK" && setup.teamSize > 1;
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    ...(["TEAMS", "MAP", "LIVE"].includes(phase) ? [button(setup, "subs", say("btnSubs"), ButtonStyle.Secondary)] : []),
    ...(phase === "SIGNUP" && picking ? [button(setup, "myteam", say("btnMyTeam"), ButtonStyle.Secondary)] : []),
    button(setup, "stats", say("btnStats"), ButtonStyle.Secondary),
    button(setup, "board", say("btnLeaderboard"), ButtonStyle.Secondary),
    new ButtonBuilder().setLabel(say("btnResults").slice(0, 80)).setStyle(ButtonStyle.Link).setURL(`https://discord.com/channels/${setup.guildId}/${setup.resultsChannelId}`),
    button(setup, "staff", say("btnStaff"), ButtonStyle.Secondary)
  );
}

function who(setup: MatchSetup, players: PlayerMap, id: string): string {
  const rank = players[id]?.rank;
  const ranks = stringList(setup.ranks);
  return setup.useRanks && rank !== null && rank !== undefined && ranks[rank] ? `<@${id}> · ${ranks[rank]}` : `<@${id}>`;
}

// Stops on a whole line so a long list never ends in a broken mention.
function fitLines(lines: string[], limit = 1024): string {
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    if (used + line.length + 12 > limit) return [...kept, `+${lines.length - kept.length} more`].join("\n");
    kept.push(line);
    used += line.length + 1;
  }
  return kept.join("\n");
}

const playerList = (setup: MatchSetup, players: PlayerMap, ids: string[]) => fitLines(ids.map((id) => who(setup, players, id))) || "Open";

function progress(filled: number, total: number): string {
  const shown = Math.min(total, 20);
  const on = Math.min(shown, Math.round((filled / Math.max(1, total)) * shown));
  return "🟩".repeat(on) + "⬛".repeat(shown - on);
}

function teamFields(setup: MatchSetup, players: PlayerMap, teams: MatchTeam[]) {
  return teams.map((team, i) => ({
    name: `${i === 0 ? "🔵" : "🟠"} ${team.name}`.slice(0, 256),
    value: fitLines(team.players.map((id) => `${id === team.captain ? "👑 " : ""}${who(setup, players, id)}`)) || "Open",
    inline: true,
  }));
}

const roundName = (ties: number, texts: unknown) => (ties === 1 ? resolveText(texts, "roundFinal").text : ties === 2 ? resolveText(texts, "roundSemi").text : ties === 4 ? resolveText(texts, "roundQuarter").text : resolveText(texts, "roundOf", { teams: ties * 2 }).text);

function tieLine(state: MatchState, tie: BracketTie, live: boolean): string {
  const name = (i: number | null) => (i === null ? "TBD" : state.teams[i].name);
  if (!tie.winner) return `${live ? "🔴 " : ""}${name(tie.a)} vs ${name(tie.b)}`;
  const [win, lose, high, low] = tie.winner === "a" ? [tie.a, tie.b, tie.scoreA, tie.scoreB] : [tie.b, tie.a, tie.scoreB, tie.scoreA];
  return `**${name(win)}** ${high}-${low} ~~${name(lose)}~~`;
}

export function bracketFields(state: MatchState, texts: unknown = {}) {
  return state.bracket.map((ties, r) => ({
    name: roundName(ties.length, texts),
    value: fitLines(ties.map((tie, i) => tieLine(state, tie, state.tie?.[0] === r && state.tie?.[1] === i))),
  }));
}

export function buildPanel(setup: MatchSetup, kind: string, number: number, phase: string, endsAt: Date | null, state: MatchState, players: PlayerMap, names: Record<string, string> = {}, texts: unknown = {}) {
  const embed = new EmbedBuilder().setColor(COLOR.open);
  const say = (key: MatchTextKey, values: Record<string, string | number> = {}) => resolveText(texts, key, values).text;
  const style = (key: MatchTextKey, values: Record<string, string | number | null | undefined> = {}) => styleEmbed(embed, texts, key, { game: setup.game, setup: setup.name, number, mapWord: setup.mapWord, ...values });
  const onMap = state.map ? ` on ${state.map}` : "";
  const until = endsAt ? `<t:${Math.floor(endsAt.getTime() / 1000)}:R>` : "soon";
  const tournament = kind === "TOURNAMENT";
  const unlimited = tournament && setup.tournamentTeams === 0;
  const needed = unlimited ? state.signups.length : tournament ? setup.teamSize * setup.tournamentTeams : setup.teamSize * 2;
  const teams = currentTeams(state);
  const word = setup.mapWord;
  let buttons: ButtonBuilder[] = [];
  let extra: Row[] = [];

  if (phase === "SIGNUP") {
    const hidden = setup.rosterView === "HIDDEN";
    const picking = setup.joinMode === "PICK" && setup.teamSize > 1;
    const names = stringList(setup.teamNames);
    const slots = tournament ? setup.tournamentTeams : 2;
    const slotLabel = (slot: number) => teamSlotName(names, tournament, slot, setup.team1Name, setup.team2Name);
    const starts = setup.startMode === "SCHEDULED" && setup.startAt && setup.startAt > new Date() ? say("noteTime", { time: `<t:${Math.floor(setup.startAt.getTime() / 1000)}:F>` }) : setup.startMode === "FULL" ? say("noteFull") : setup.startMode === "MANUAL" ? say("noteManual") : "";
    const wait = endsAt && setup.startMode !== "SCHEDULED" ? ` ${tournament ? "Starts with whoever joined" : "Resets"} ${until}.` : "";
    const unix = setup.startAt ? Math.floor(setup.startAt.getTime() / 1000) : 0;
    const startTime = setup.startMode === "SCHEDULED" && unix ? `<t:${unix}:F> (<t:${unix}:R>)` : setup.startMode === "FULL" ? "When the lobby fills" : "When staff start it";
    const eachTeam = setup.teamSize === 1 ? "Solo" : `${setup.flexTeams ? "Up to " : ""}${setup.teamSize} per team`;
    const mapText = !setup.useMaps ? "None" : setup.mapMethod === "RANDOM" ? `Picked at random from ${stringList(setup.maps).length}` : setup.mapMethod === "BANS" ? `Captains ban from ${setup.mapChoices}` : `Player vote on ${setup.mapChoices} ${word.toLowerCase()}s`;
    const formatName = tournament ? `${setup.teamSize === 1 ? "1v1 " : ""}Tournament · Single Elimination` : setup.teamSize === 1 ? "1v1" : "Team Match";
    const teamText = tournament ? `${setup.tournamentTeams ? `Up to ${setup.tournamentTeams}` : "Unlimited"} ${setup.teamSize === 1 ? "players" : "teams"}${setup.teamSize === 1 ? "" : ` · ${eachTeam}`}` : eachTeam;
    const signedUp = unlimited ? `**${state.signups.length}** signed up` : `${progress(state.signups.length, needed)}\n**${state.signups.length}/${needed}** signed up`;
    style(tournament ? "registration" : "signup", { size: `${setup.teamSize}v${setup.teamSize}`, start: `${starts}${wait}`, progress: unlimited ? "Open to everyone" : progress(state.signups.length, needed), count: state.signups.length, needed: unlimited ? "∞" : needed, startTime: `${startTime}${wait}`, format: formatName, teams: teamText, maps: mapText, signedUp, eventLink: state.eventId ? `[View event](https://discord.com/events/${setup.guildId}/${state.eventId})` : "" });
    const notes = hidden ? say("noteHidden") : "";
    if (notes) embed.setDescription([embed.data.description, notes].filter(Boolean).join("\n").slice(0, 4096));
    if (picking) {
      embed.addFields(
        ...Array.from({ length: Math.min(slots, 8) }, (_, slot) => ({
          name: `${slotLabel(slot)} (${onTeam(state, slot).length}/${setup.teamSize})`.slice(0, 256),
          value: hidden ? (onTeam(state, slot).length ? "🔒 Hidden" : "Open") : playerList(setup, players, onTeam(state, slot)),
          inline: true,
        }))
      );
      buttons = [...Array.from({ length: slots }, (_, slot) => button(setup, "pick", `${slotLabel(slot)} (${onTeam(state, slot).length}/${setup.teamSize})`, ButtonStyle.Primary, slot).setDisabled(onTeam(state, slot).length >= setup.teamSize)), button(setup, "leave", say("btnLeave"), ButtonStyle.Danger)];
    } else {
      if (!hidden) embed.addFields({ name: say("labelPlayers"), value: state.signups.length ? playerList(setup, players, state.signups) : say("labelNoSignups") });
      buttons = [button(setup, "join", say(tournament ? "btnRegister" : "btnSignUp"), ButtonStyle.Success), button(setup, "leave", say("btnLeave"), ButtonStyle.Danger)];
    }
  } else if (phase === "CHECKIN") {
    style("checkin", { deadline: endsAt ? say("noteCheckinTimed", { time: until }) : say("noteCheckinOpen"), progress: progress(state.ready.length, state.signups.length), count: state.ready.length, needed: state.signups.length });
    buttons = [button(setup, "ready", say("btnReady"), ButtonStyle.Success)];
  } else if (phase === "DRAFT") {
    const side = draftSide(state.draftPick) === "a" ? 0 : 1;
    style("draft", { captain: `<@${state.teams[side].captain}>` });
    if (endsAt) embed.setDescription(`${embed.data.description ?? ""} Auto-picks ${until}.`.trim());
    embed.addFields(...teamFields(setup, players, state.teams), { name: say("labelPicking"), value: playerList(setup, players, state.draftPool) });
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`matchdraft:${setup.id}`)
      .setPlaceholder("Captain: pick a player")
      .addOptions(state.draftPool.slice(0, 25).map((id, i) => ({ label: (names[id] ?? `Player ${i + 1}`).slice(0, 100), description: players[id]?.rank != null ? stringList(setup.ranks)[players[id]!.rank!] : undefined, value: id })));
    extra = [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu)];
  } else if (phase === "TEAMS") {
    const naming = setup.teamNaming === "CAPTAIN" && setup.teamSize > 1;
    const wait = endsAt ? say("noteTeamsAuto", { time: until }) : say("noteTeamsWait");
    if (state.roomId) {
      const voting = setup.useMaps && setup.mapMethod === "VOTE" && stringList(setup.maps).length > 0;
      style("matchRoomReady", { next: voting ? `the ${word.toLowerCase()} vote` : "the match", auto: endsAt ? wait : "" });
      if (teams) embed.addFields(...teamFields(setup, players, teams));
      buttons = [button(setup, "start", say(voting ? "btnStartVote" : "btnStart"), ButtonStyle.Success)];
    } else {
      style(naming ? "nameTeams" : "teams", { auto: wait });
      if (!tournament) embed.addFields(...teamFields(setup, players, state.teams));
      buttons = [button(setup, "start", say("btnStart"), ButtonStyle.Success), ...(naming ? [button(setup, "name", say("btnNameTeam"), ButtonStyle.Primary)] : [])];
    }
  } else if (phase === "MAP") {
    const labels = teams ? teamFields(setup, players, teams) : [];
    if (setup.mapMethod === "BANS") {
      const captain = teams?.[state.banTurn === "a" ? 0 : 1].captain;
      style("bans", { captain: `<@${captain}>`, banned: `${endsAt ? ` Time runs out ${until}.` : ""}${state.banned.length ? `\nBanned: ${state.banned.join(", ")}` : ""}` });
      embed.addFields(...labels);
      buttons = state.mapOptions.flatMap((m, i) => (state.banned.includes(m) ? [] : [button(setup, "ban", m, ButtonStyle.Danger, i)]));
    } else {
      const count = (m: string) => Object.values(state.votes).filter((v) => v === m).length;
      style("vote", { deadline: endsAt ? say("noteVoteTimed", { time: until }) : say("noteVoteOpen") });
      embed.addFields(...labels);
      buttons = state.mapOptions.map((m, i) => button(setup, "vote", `${m} (${count(m)})`, ButtonStyle.Primary, i));
    }
  } else if ((phase === "LIVE" || phase === "CONFIRM") && teams) {
    const reportRule = phase === "CONFIRM" ? "Accepted automatically if nobody responds" : state.disputes >= 2 || setup.reportBy === "STAFF" ? "Staff report the result" : setup.reportBy === "BOTH" ? "One captain reports, the other confirms" : "Either captain reports the result";
    style("live", { match: tournament ? `${teams[0].name} vs ${teams[1].name}` : `Match #${number}`, onMap, mapNote: state.mapNote ? `${word} pick: ${state.mapNote}` : "", reportRule });
    embed.addFields(...teamFields(setup, players, teams));
    if (phase === "LIVE") {
      buttons = [button(setup, "report", `${teams[0].name} Won`, ButtonStyle.Primary, "a"), button(setup, "report", `${teams[1].name} Won`, ButtonStyle.Secondary, "b")];
    } else if (state.report) {
      const r = state.report;
      embed.addFields({ name: say("labelConfirm"), value: `<@${r.by}> reported **${(r.winner === "a" ? teams[0] : teams[1]).name}** won ${r.winnerScore}-${r.loserScore} ${setup.scoreName}. Accepted ${until}.` });
      buttons = [button(setup, "confirm", say("btnConfirm"), ButtonStyle.Success), button(setup, "dispute", say("btnDispute"), ButtonStyle.Danger)];
    }
  } else if (phase === "CLOSING") {
    style("matchRoomClosing", { winner: state.closing?.winner, score: state.closing?.score, time: until });
  } else if (phase === "DONE") {
    if (tournament && state.champion !== null) {
      style("champion", { winner: state.teams[state.champion].name, players: state.teams[state.champion].players.map((id) => `<@${id}>`).join(" ") });
      buttons = [button(setup, "new", say("btnNewTournament"), ButtonStyle.Success)];
    } else {
      const winner = state.winner === "b" ? state.teams[1] : state.teams[0];
      style("done", { winner: winner?.name, score: state.score ?? "", onMap, rewards: setup.rewardsEnabled ? say("noteDoneRewards", { win: setup.winCoins, loss: setup.lossCoins }) : say("noteDone") });
      buttons = [button(setup, "runback", say("btnRunBack"), ButtonStyle.Success), button(setup, "new", say("btnNewSignups"), ButtonStyle.Primary)];
    }
  }

  if (tournament && state.bracket.length && !state.roomId) embed.addFields(...bracketFields(state, texts));
  if (state.subsNeeded.length && ["TEAMS", "MAP", "LIVE"].includes(phase)) embed.addFields({ name: say("labelSubs"), value: say("labelSubsNote", { count: state.subsNeeded.length }) });
  return { content: "", embeds: [embed], components: [...rows(buttons).slice(0, extra.length ? 3 : 4), ...extra, navRow(setup, phase, say)].slice(0, 5) };
}

// The first post in a match room, which pings the players once.
export function buildRoomWelcome(setup: MatchSetup, teams: [MatchTeam, MatchTeam], players: PlayerMap, number: number, texts: unknown = {}) {
  return styleEmbed(new EmbedBuilder(), texts, "matchRoomWelcome", { game: setup.game, setup: setup.name, number, a: teams[0].name, b: teams[1].name }).addFields(...teamFields(setup, players, teams));
}

// The main panel while a match plays in its room. Subs and staff stay here, so
// people who can't see a private room can still help.
export function buildRoomNotice(setup: MatchSetup, phase: string, number: number, state: MatchState, texts: unknown = {}) {
  const say = (key: MatchTextKey) => resolveText(texts, key).text;
  const teams = currentTeams(state);
  const values = { game: setup.game, setup: setup.name, number };
  const embed = new EmbedBuilder();
  if (phase === "CLOSING") styleEmbed(embed, texts, "matchRoomNoticeDone", { ...values, winner: state.closing?.winner, score: state.closing?.score, next: state.tie ? " The next match opens when this room closes." : "" });
  else styleEmbed(embed, texts, "matchRoomNotice", { ...values, match: teams ? `${teams[0].name} vs ${teams[1].name}` : setup.name, room: `<#${state.roomId}>` });
  if (state.bracket.length) embed.addFields(...bracketFields(state, texts));
  if (state.subsNeeded.length && ["TEAMS", "MAP", "LIVE"].includes(phase)) embed.addFields({ name: say("labelSubs"), value: resolveText(texts, "labelSubsNote", { count: state.subsNeeded.length }).text });
  return { content: "", embeds: [embed], components: [navRow(setup, phase, say)] };
}

export function buildLeaderboard(setup: MatchSetup, rows: MatchPlayer[]) {
  const medals = ["🥇", "🥈", "🥉"];
  const lines = rows.map((p, i) => {
    const games = p.wins + p.losses;
    const percent = games ? Math.round((p.wins / games) * 100) : 0;
    return `${medals[i] ?? `**${i + 1}.**`} <@${p.userId}>: ${p.wins}W ${p.losses}L · ${percent}%${p.tournamentWins ? ` · 🏆 ${p.tournamentWins}` : ""}${p.streak > 1 ? ` · 🔥 ${p.streak}` : ""}`;
  });
  return new EmbedBuilder()
    .setColor(COLOR.gold)
    .setTitle(`📊 ${setup.game} Season ${setup.season} Leaderboard`)
    .setDescription(lines.join("\n").slice(0, 4096) || "No matches played yet.")
    .setFooter({ text: `${setup.name} · Updates after every match` });
}

export function buildStats(setup: MatchSetup, p: MatchPlayer | null, texts: unknown = {}) {
  const wins = p?.wins ?? 0;
  const losses = p?.losses ?? 0;
  const games = wins + losses;
  const ranks = stringList(setup.ranks);
  const rank = p?.rank !== null && p?.rank !== undefined ? ranks[p.rank] : null;
  return styleEmbed(new EmbedBuilder(), texts, "stats", { game: setup.game })
    .addFields(
      { name: "Rank", value: setup.useRanks ? rank ?? "Not set" : "Not used", inline: true },
      { name: "Rating", value: String(p?.rating ?? 1000), inline: true },
      { name: "Record", value: `${wins}W ${losses}L${games ? ` (${Math.round((wins / games) * 100)}%)` : ""}`, inline: true },
      { name: "Streak", value: p?.streak ? `🔥 ${p.streak}` : "None yet", inline: true },
      { name: "Coins earned", value: String(p?.coinsEarned ?? 0), inline: true },
      { name: "Tournaments won", value: String(p?.tournamentWins ?? 0), inline: true }
    );
}

export function buildResult(setup: MatchSetup, result: MatchResult, texts: unknown = {}) {
  const winners = stringList(result.winners).map((id) => `<@${id}>`).join(" ");
  const losers = stringList(result.losers).map((id) => `<@${id}>`).join(" ");
  const details = result.map ? `${setup.mapWord}: ${result.map} · ${setup.scoreName}` : "";
  const embed = styleEmbed(new EmbedBuilder(), texts, "result", { number: result.number, winner: result.winnerName, score: `${result.winnerScore}-${result.loserScore}`, details, game: setup.game })
    .addFields({ name: result.winnerName.slice(0, 256), value: winners.slice(0, 1024) || "Unknown", inline: true }, { name: result.loserName.slice(0, 256), value: losers.slice(0, 1024) || "Unknown", inline: true })
    .setTimestamp(result.createdAt);
  if (result.voided) embed.setColor(COLOR.bad);
  return embed;
}

export function buildRosters(teams: MatchTeam[], texts: unknown = {}) {
  const embed = styleEmbed(new EmbedBuilder(), texts, "rosters");
  return embed.addFields(...teams.slice(0, 25 - (embed.data.fields?.length ?? 0)).map((team) => ({ name: team.name.slice(0, 256), value: fitLines(team.players.map((id) => `${id === team.captain ? "👑 " : ""}<@${id}>`)) || "Open", inline: true })));
}

export function buildBracket(setup: MatchSetup, state: MatchState, texts: unknown = {}) {
  return styleEmbed(new EmbedBuilder(), texts, "bracket", { setup: setup.name, game: setup.game }).addFields(...bracketFields(state, texts));
}
