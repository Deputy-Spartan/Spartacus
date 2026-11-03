import { Client, EmbedBuilder } from "discord.js";
import { gameColor, resolveText, textsForGame, type MatchTextKey, type TextOverrides } from "@spartacus/shared";
import { styleEmbed } from "./render";
import { logError } from "@spartacus/db";
import { prisma } from "../../lib/prisma";
import { isSendableChannel } from "../../lib/channels";
import { tallyBoard, type BoardEntry } from "./engine";
import { withLock } from "./lock";
import { stringList } from "./render";

const MEDALS = ["🥇", "🥈", "🥉"];

function line(entry: BoardEntry, index: number, name: string): string {
  const games = entry.wins + entry.losses;
  const percent = games ? Math.round((entry.wins / games) * 100) : 0;
  return `${MEDALS[index] ?? `**${index + 1}.**`} ${name}: ${entry.wins}W ${entry.losses}L · ${percent}%`;
}

// Your own description stays, with the ranked list always below it.
function withList(embed: EmbedBuilder, list: string) {
  const description = embed.data.description ?? "";
  if (!description.includes(list)) embed.setDescription([description, list].filter(Boolean).join("\n\n").slice(0, 4096));
  return embed;
}

export async function buildBoard(client: Client, guildId: string, game: string, since: Date | null, texts: TextOverrides = {}, style = "COMBINED") {
  const results = await prisma.matchResult.findMany({
    where: { guildId, voided: false, ...(game === "ALL" ? {} : { game }), ...(since ? { createdAt: { gte: since } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
  const { players, teams } = tallyBoard(results.map((r) => ({ winners: stringList(r.winners), losers: stringList(r.losers), winnerTeam: r.winnerTeam, loserTeam: r.loserTeam })));

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  const members = await Promise.all(players.map((p) => guild?.members.fetch(p.key).catch(() => null)));
  const label = game === "ALL" ? "All Games" : game;
  const say = (key: MatchTextKey) => resolveText(texts, key).text;
  const color = (key: MatchTextKey, embed: EmbedBuilder) => (texts[key]?.color ? embed : embed.setColor(parseInt(gameColor(game).slice(1), 16)));
  // Mentions show as clickable names in an embed and never ping anyone.
  const playerList = players.map((p, i) => line(p, i, members[i] ? `<@${p.key}>` : "Former member")).join("\n") || say("labelNoPlayers");
  const teamList = teams.map((t, i) => line(t, i, t.key)).join("\n") || say("labelNoTeams");

  if (style === "SEPARATE") {
    return [
      color("boardPlayers", withList(styleEmbed(new EmbedBuilder(), texts, "boardPlayers", { game: label, list: playerList }), playerList)),
      color("boardTeams", withList(styleEmbed(new EmbedBuilder(), texts, "boardTeams", { game: label, list: teamList }), teamList)),
    ];
  }
  const embed = styleEmbed(new EmbedBuilder(), texts, "boardCombined", { game: label }).addFields({ name: say("labelTopPlayers"), value: playerList.slice(0, 1024), inline: true }, { name: say("labelTopTeams"), value: teamList.slice(0, 1024), inline: true });
  return [color("boardCombined", embed)];
}

const readMessages = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, string>) : {});

// Every switched-on game gets its own post. Passing a game only refreshes that
// game and All Games, so one finished match doesn't edit every post.
export function syncBoard(client: Client, guildId: string, game?: string) {
  return withLock(`board:${guildId}`, () => postBoards(client, guildId, game));
}

async function postBoards(client: Client, guildId: string, game?: string) {
  const config = await prisma.matchmakingConfig.findUnique({ where: { guildId } });
  if (!config?.boardChannelId) return;
  const channel = await client.channels.fetch(config.boardChannelId).catch(() => null);
  if (!isSendableChannel(channel)) return;

  const wanted = stringList(config.boardGames);
  const messages = { ...readMessages(config.boardMessages) };
  for (const [key, id] of Object.entries(messages)) {
    if (wanted.includes(key)) continue;
    const old = await channel.messages.fetch(id).catch(() => null);
    await old?.delete().catch(() => null);
    delete messages[key];
  }

  for (const key of wanted) {
    if (game && key !== "ALL" && key !== game && messages[key]) continue;
    const embeds = await buildBoard(client, guildId, key, config.boardSince, textsForGame(config.texts, config.gameTexts, key === "ALL" ? null : key), config.boardStyle);
    const message = messages[key] ? await channel.messages.fetch(messages[key]).catch(() => null) : null;
    if (await message?.edit({ embeds }).catch(() => null)) continue;
    const sent = await channel.send({ embeds, allowedMentions: { parse: [] } }).catch((err) => {
      logError("bot", err, guildId);
      return null;
    });
    if (sent) messages[key] = sent.id;
  }
  await prisma.matchmakingConfig.update({ where: { guildId }, data: { boardMessages: messages } });
}

export async function startBoardSeason(client: Client, guildId: string) {
  await prisma.matchmakingConfig.upsert({ where: { guildId }, create: { guildId, boardSince: new Date() }, update: { boardSince: new Date() } });
  await prisma.matchSetup.updateMany({ where: { guildId }, data: { season: { increment: 1 } } });
  await prisma.matchPlayer.updateMany({ where: { guildId }, data: { wins: 0, losses: 0, streak: 0, tournamentWins: 0 } });
  await syncBoard(client, guildId);
}
