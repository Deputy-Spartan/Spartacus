import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, type MessageActionRowComponentBuilder } from "discord.js";
import type { MatchPlayer, MatchResult, MatchSetup } from "@prisma/client";
import { currentTeams, draftSide, type BracketTie, type MatchState, type MatchTeam } from "./engine";

export type PlayerMap = Record<string, MatchPlayer | undefined>;
type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

const COLOR = { open: 0x7b99bc, live: 0x3ba55d, gold: 0xf0b232, bad: 0xed4245 };

export const stringList = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

const button = (setup: MatchSetup, action: string, label: string, style: ButtonStyle, arg?: string | number) =>
  new ButtonBuilder()
    .setCustomId(`match:${setup.id}:${action}${arg === undefined ? "" : `:${arg}`}`)
    .setLabel(label.slice(0, 80))
    .setStyle(style);

function rows(buttons: ButtonBuilder[]): Row[] {
  return Array.from({ length: Math.ceil(buttons.length / 5) }, (_, r) => new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(buttons.slice(r * 5, r * 5 + 5)));
}

function navRow(setup: MatchSetup): Row {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    button(setup, "stats", "My Stats", ButtonStyle.Secondary),
    button(setup, "board", "Leaderboard", ButtonStyle.Secondary),
    new ButtonBuilder().setLabel("All Results").setStyle(ButtonStyle.Link).setURL(`https://discord.com/channels/${setup.guildId}/${setup.resultsChannelId}`),
    button(setup, "staff", "Staff", ButtonStyle.Secondary)
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

const roundName = (ties: number) => (ties === 1 ? "Final" : ties === 2 ? "Semifinals" : ties === 4 ? "Quarterfinals" : `Round of ${ties * 2}`);

function tieLine(state: MatchState, tie: BracketTie, live: boolean): string {
  const name = (i: number | null) => (i === null ? "TBD" : state.teams[i].name);
  if (!tie.winner) return `${live ? "🔴 " : ""}${name(tie.a)} vs ${name(tie.b)}`;
  const [win, lose, high, low] = tie.winner === "a" ? [tie.a, tie.b, tie.scoreA, tie.scoreB] : [tie.b, tie.a, tie.scoreB, tie.scoreA];
  return `**${name(win)}** ${high}-${low} ~~${name(lose)}~~`;
}

export function bracketFields(state: MatchState) {
  return state.bracket.map((ties, r) => ({
    name: roundName(ties.length),
    value: fitLines(ties.map((tie, i) => tieLine(state, tie, state.tie?.[0] === r && state.tie?.[1] === i))),
  }));
}

export function buildPanel(setup: MatchSetup, kind: string, number: number, phase: string, endsAt: Date | null, state: MatchState, players: PlayerMap, names: Record<string, string> = {}) {
  const embed = new EmbedBuilder().setColor(COLOR.open);
  const until = endsAt ? `<t:${Math.floor(endsAt.getTime() / 1000)}:R>` : "soon";
  const tournament = kind === "TOURNAMENT";
  const needed = tournament ? setup.teamSize * setup.tournamentTeams : setup.teamSize * 2;
  const teams = currentTeams(state);
  const word = setup.mapWord;
  let buttons: ButtonBuilder[] = [];
  let extra: Row[] = [];

  if (phase === "SIGNUP") {
    embed
      .setTitle(tournament ? `🏆 ${setup.name}: Registration` : `⚔️ Match #${number}: ${setup.teamSize}v${setup.teamSize} ${setup.game} Sign-Ups`)
      .setDescription(`${tournament ? "Register solo and the bot builds the teams." : "Hit Sign Up to play. Teams are built when the lobby fills."}\n${progress(state.signups.length, needed)} **${state.signups.length}/${needed}**`)
      .addFields({ name: "Players", value: playerList(setup, players, state.signups) });
    buttons = [button(setup, "join", tournament ? "Register" : "Sign Up", ButtonStyle.Success), button(setup, "leave", "Leave", ButtonStyle.Danger)];
  } else if (phase === "CHECKIN") {
    embed
      .setColor(COLOR.gold)
      .setTitle("✅ Lobby Full: Check In")
      .setDescription(`Ready up ${until} or your slot opens for the next player.\n${progress(state.ready.length, state.signups.length)} **${state.ready.length}/${state.signups.length}** ready`);
    buttons = [button(setup, "ready", "Ready Up", ButtonStyle.Success)];
  } else if (phase === "DRAFT") {
    const side = draftSide(state.draftPick) === "a" ? 0 : 1;
    embed
      .setTitle(`🎯 Match #${number}: Captains Draft`)
      .setDescription(`<@${state.teams[side].captain}> is picking. Auto-picks ${until}.`)
      .addFields(...teamFields(setup, players, state.teams), { name: "Still to pick", value: playerList(setup, players, state.draftPool) });
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`matchdraft:${setup.id}`)
      .setPlaceholder("Captain: pick a player")
      .addOptions(state.draftPool.slice(0, 25).map((id, i) => ({ label: (names[id] ?? `Player ${i + 1}`).slice(0, 100), description: players[id]?.rank != null ? stringList(setup.ranks)[players[id]!.rank!] : undefined, value: id })));
    extra = [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu)];
  } else if (phase === "TEAMS") {
    embed
      .setTitle(`🎯 Match #${number}: Teams`)
      .setDescription("Captains can start when both sides are ready.")
      .addFields(...teamFields(setup, players, state.teams))
      .setFooter({ text: "Captains are marked with 👑" });
    buttons = [button(setup, "start", "Start Match", ButtonStyle.Success)];
  } else if (phase === "MAP") {
    const labels = teams ? teamFields(setup, players, teams) : [];
    if (setup.mapMethod === "BANS") {
      const captain = teams?.[state.banTurn === "a" ? 0 : 1].captain;
      embed
        .setTitle(`🚫 Captains Ban ${word}s`)
        .setDescription(`<@${captain}> bans next, ${until}.${state.banned.length ? `\nBanned: ${state.banned.join(", ")}` : ""}`)
        .addFields(...labels)
        .setFooter({ text: `The last ${word.toLowerCase()} left gets played` });
      buttons = state.mapOptions.flatMap((m, i) => (state.banned.includes(m) ? [] : [button(setup, "ban", m, ButtonStyle.Danger, i)]));
    } else {
      const count = (m: string) => Object.values(state.votes).filter((v) => v === m).length;
      embed
        .setTitle(`🗺️ Vote for the ${word}`)
        .setDescription(`Voting closes ${until}. Ties are picked at random.`)
        .addFields(...labels);
      buttons = state.mapOptions.map((m, i) => button(setup, "vote", `${m} (${count(m)})`, ButtonStyle.Primary, i));
    }
  } else if ((phase === "LIVE" || phase === "CONFIRM") && teams) {
    embed
      .setColor(COLOR.live)
      .setTitle(`🔴 LIVE: ${tournament ? `${teams[0].name} vs ${teams[1].name}` : `Match #${number}`}${state.map ? ` on ${state.map}` : ""}`)
      .addFields(...teamFields(setup, players, teams));
    if (state.mapNote) embed.setDescription(`${word} pick: ${state.mapNote}`);
    if (phase === "LIVE") {
      buttons = [button(setup, "report", `${teams[0].name} Won`, ButtonStyle.Primary, "a"), button(setup, "report", `${teams[1].name} Won`, ButtonStyle.Secondary, "b")];
      embed.setFooter({ text: setup.reportBy === "BOTH" ? "One captain reports, the other confirms" : setup.reportBy === "STAFF" ? "Staff report the result" : "Either captain reports the result" });
    } else if (state.report) {
      const r = state.report;
      embed.setFooter({ text: "Accepted automatically if nobody responds" }).addFields({ name: "Waiting for confirmation", value: `<@${r.by}> reported **${(r.winner === "a" ? teams[0] : teams[1]).name}** won ${r.winnerScore}-${r.loserScore} ${setup.scoreName}. Accepted ${until}.` });
      buttons = [button(setup, "confirm", "Confirm", ButtonStyle.Success), button(setup, "dispute", "Dispute", ButtonStyle.Danger)];
    }
  } else if (phase === "DONE") {
    embed.setColor(COLOR.gold);
    if (tournament && state.champion !== null) {
      embed
        .setTitle(`🏆 ${state.teams[state.champion].name} won ${setup.name}!`)
        .setDescription(state.teams[state.champion].players.map((id) => `<@${id}>`).join(" ").slice(0, 4096));
      buttons = [button(setup, "new", "Start New Tournament", ButtonStyle.Success)];
    } else {
      const winner = state.winner === "b" ? state.teams[1] : state.teams[0];
      embed
        .setTitle(`🏆 ${winner?.name} wins ${state.score ?? ""}${state.map ? ` on ${state.map}` : ""}`.slice(0, 256))
        .setDescription(`+${setup.winCoins} coins to the winners, +${setup.lossCoins} to the other team. Leaderboard updated.`);
      buttons = [button(setup, "runback", "Run It Back", ButtonStyle.Success), button(setup, "new", "New Sign-Ups", ButtonStyle.Primary)];
    }
  }

  if (tournament && state.bracket.length) embed.addFields(...bracketFields(state));
  return { content: "", embeds: [embed], components: [...extra, ...rows(buttons), navRow(setup)].slice(0, 5) };
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

export function buildStats(setup: MatchSetup, p: MatchPlayer | null) {
  const wins = p?.wins ?? 0;
  const losses = p?.losses ?? 0;
  const games = wins + losses;
  const ranks = stringList(setup.ranks);
  const rank = p?.rank !== null && p?.rank !== undefined ? ranks[p.rank] : null;
  return new EmbedBuilder()
    .setColor(COLOR.open)
    .setTitle(`🎖️ Your ${setup.game} Stats`)
    .addFields(
      { name: "Rank", value: setup.useRanks ? rank ?? "Not set" : "Not used", inline: true },
      { name: "Rating", value: String(p?.rating ?? 1000), inline: true },
      { name: "Record", value: `${wins}W ${losses}L${games ? ` (${Math.round((wins / games) * 100)}%)` : ""}`, inline: true },
      { name: "Streak", value: p?.streak ? `🔥 ${p.streak}` : "None yet", inline: true },
      { name: "Coins earned", value: String(p?.coinsEarned ?? 0), inline: true },
      { name: "Tournaments won", value: String(p?.tournamentWins ?? 0), inline: true }
    );
}

export function buildResult(setup: MatchSetup, result: MatchResult) {
  const winners = stringList(result.winners).map((id) => `<@${id}>`).join(" ");
  const losers = stringList(result.losers).map((id) => `<@${id}>`).join(" ");
  const embed = new EmbedBuilder()
    .setColor(result.voided ? COLOR.bad : COLOR.gold)
    .setTitle(`Match #${result.number}: ${result.winnerName} won ${result.winnerScore}-${result.loserScore}`.slice(0, 256))
    .addFields({ name: result.winnerName.slice(0, 256), value: winners.slice(0, 1024) || "Unknown", inline: true }, { name: result.loserName.slice(0, 256), value: losers.slice(0, 1024) || "Unknown", inline: true })
    .setTimestamp(result.createdAt);
  if (result.map) embed.setDescription(`${setup.mapWord}: ${result.map} · ${setup.scoreName}`);
  return embed;
}

export function buildBracket(setup: MatchSetup, state: MatchState) {
  return new EmbedBuilder().setColor(COLOR.gold).setTitle(`🏆 ${setup.name} Bracket`).addFields(...bracketFields(state));
}
