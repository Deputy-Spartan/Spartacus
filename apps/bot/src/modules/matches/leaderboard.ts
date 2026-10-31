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

const readMessages = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, string>) : {});

// Every switched-on game gets its own post. Passing a game only refreshes that
// game and All Games, so one finished match doesn't edit every post.
export async function syncBoard(client: Client, guildId: string, game?: string) {
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
    const embeds = await buildBoard(client, guildId, key, config.boardSince);
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
