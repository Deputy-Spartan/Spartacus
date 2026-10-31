import { Client, EmbedBuilder } from "discord.js";
import { logError } from "@spartacus/db";
import { prisma } from "../../lib/prisma";
import { isSendableChannel } from "../../lib/channels";
import { tallyBoard, type BoardEntry } from "./engine";
import { stringList } from "./render";

const MEDALS = ["🥇", "🥈", "🥉"];

function line(entry: BoardEntry, index: number, name: string): string {
  const games = entry.wins + entry.losses;
  const percent = games ? Math.round((entry.wins / games) * 100) : 0;
  return `${MEDALS[index] ?? `**${index + 1}.**`} ${name}: ${entry.wins}W ${entry.losses}L · ${percent}%`;
}

export async function buildBoard(client: Client, guildId: string, game: string, since: Date | null) {
  const results = await prisma.matchResult.findMany({
    where: { guildId, voided: false, ...(game === "ALL" ? {} : { game }), ...(since ? { createdAt: { gte: since } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
  const { players, teams } = tallyBoard(results.map((r) => ({ winners: stringList(r.winners), losers: stringList(r.losers), winnerTeam: r.winnerTeam, loserTeam: r.loserTeam })));

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  const members = await Promise.all(players.map((p) => guild?.members.fetch(p.key).catch(() => null)));
  const label = game === "ALL" ? "All Games" : game;
  return [
    new EmbedBuilder()
      .setColor(0xf0b232)
      .setTitle(`🏅 Top 10 Players: ${label}`.slice(0, 256))
      .setDescription(players.map((p, i) => line(p, i, members[i]?.displayName ?? "Former member")).join("\n") || "No matches played yet.")
      .setFooter({ text: "Updates after every match" }),
    new EmbedBuilder()
      .setColor(0x7b99bc)
      .setTitle(`👥 Top 10 Teams: ${label}`.slice(0, 256))
      .setDescription(teams.map((t, i) => line(t, i, t.key)).join("\n") || "No team matches played yet.")
      .setFooter({ text: "Saved and named teams · Updates after every match" }),
  ];
}

export async function syncBoard(client: Client, guildId: string) {
  const config = await prisma.matchmakingConfig.findUnique({ where: { guildId } });
  if (!config?.boardChannelId) return;
  const channel = await client.channels.fetch(config.boardChannelId).catch(() => null);
  if (!isSendableChannel(channel)) return;

  const embeds = await buildBoard(client, guildId, config.boardGame, config.boardSince);
  if (config.boardMessageId) {
    const message = await channel.messages.fetch(config.boardMessageId).catch(() => null);
    if (await message?.edit({ embeds }).catch(() => null)) return;
  }
  const sent = await channel.send({ embeds, allowedMentions: { parse: [] } }).catch((err) => {
    logError("bot", err, guildId);
    return null;
  });
  if (sent) await prisma.matchmakingConfig.update({ where: { guildId }, data: { boardMessageId: sent.id } });
}

export async function startBoardSeason(client: Client, guildId: string) {
  await prisma.matchmakingConfig.upsert({ where: { guildId }, create: { guildId, boardSince: new Date() }, update: { boardSince: new Date() } });
  await prisma.matchSetup.updateMany({ where: { guildId }, data: { season: { increment: 1 } } });
  await prisma.matchPlayer.updateMany({ where: { guildId }, data: { wins: 0, losses: 0, streak: 0, tournamentWins: 0 } });
  await syncBoard(client, guildId);
}
