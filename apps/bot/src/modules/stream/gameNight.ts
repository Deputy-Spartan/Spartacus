import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits, type ButtonInteraction, type Client } from "discord.js";
import type { GameNight } from "@prisma/client";
import { SG_PREFIX, TEAM_NAMES, splitTeams } from "@spartacus/shared";
import { logError } from "@spartacus/db";
import { prisma } from "../../lib/prisma";
import { isSendableChannel } from "../../lib/channels";
import { isModuleEnabled } from "../../lib/moduleGate";

// Game nights: /gamenight posts a sign-up with Join and Leave buttons. 15
// minutes before the start the players are pinged, and at the start the bot
// splits them into teams (or the host presses Make teams sooner).

const GOLD = 0xffd700;
const clean = (s: string) => s.replace(/[*_`~|]/g, "");

async function players(id: string) {
  return prisma.gameNightPlayer.findMany({ where: { gameNightId: id }, orderBy: { joinedAt: "asc" } });
}

export function gameNightEmbed(g: GameNight, list: string[]) {
  const at = Math.floor(g.startAt.getTime() / 1000);
  const status = g.status === "CANCELED" ? "❌ Cancelled" : g.status === "DONE" ? "✅ Done" : g.status === "TEAMS" ? "🎲 Teams are set" : "🟢 Open for sign-ups";
  const e = new EmbedBuilder()
    .setColor(g.status === "CANCELED" ? 0x4b4f58 : GOLD)
    .setTitle(`🎮 Game Night: ${clean(g.game)}`.slice(0, 256))
    .setDescription([g.note ? clean(g.note).slice(0, 500) : null, `**When:** <t:${at}:F> (<t:${at}:R>)`, `**Host:** <@${g.hostId}>`, `**Status:** ${status}`].filter(Boolean).join("\n"))
    .addFields({
      name: `Players (${list.length}${g.maxPlayers ? `/${g.maxPlayers}` : ""})`,
      value: list.length ? list.map((u, i) => `${i + 1}. <@${u}>`).join("\n").slice(0, 1024) : "Nobody yet. Tap Join!",
    })
    .setFooter({ text: g.teamSize ? `Teams of ${g.teamSize}, picked at random when it starts` : "No teams, just play" });
  const teams = Array.isArray(g.teams) ? (g.teams as string[][]) : null;
  if (teams?.length) for (const [i, t] of teams.entries()) e.addFields({ name: TEAM_NAMES[i % TEAM_NAMES.length], value: t.map((u) => `<@${u}>`).join("\n").slice(0, 1024) || "—", inline: true });
  return e;
}

export function gameNightRows(g: GameNight) {
  if (g.status === "CANCELED" || g.status === "DONE") return [];
  const b = (action: string, label: string, style: ButtonStyle, emoji?: string) => {
    const btn = new ButtonBuilder().setCustomId(`${SG_PREFIX}gn:${action}:${g.id}`).setLabel(label).setStyle(style);
    if (emoji) btn.setEmoji(emoji);
    return btn;
  };
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(b("join", "Join", ButtonStyle.Success, "✅"), b("leave", "Leave", ButtonStyle.Secondary));
  if (g.teamSize) row.addComponents(b("teams", "Make teams", ButtonStyle.Primary, "🎲"));
  row.addComponents(b("cancel", "Cancel", ButtonStyle.Danger));
  return [row];
}

async function refreshPost(client: Client, g: GameNight) {
  if (!g.messageId) return;
  const ch = await client.channels.fetch(g.channelId).catch(() => null);
  const msg = ch && "messages" in ch ? await ch.messages.fetch(g.messageId).catch(() => null) : null;
  const list = (await players(g.id)).map((p) => p.userId);
  await msg?.edit({ embeds: [gameNightEmbed(g, list)], components: gameNightRows(g), allowedMentions: { parse: [] } }).catch(() => null);
}

export async function postGameNight(client: Client, g: GameNight, pingRoleId: string | null) {
  const ch = await client.channels.fetch(g.channelId).catch(() => null);
  if (!isSendableChannel(ch)) return { ok: false, error: "Spartacus can't post in the game night channel." };
  const list = (await players(g.id)).map((p) => p.userId);
  const sent = await ch
    .send({ content: pingRoleId ? `<@&${pingRoleId}> a game night is up!` : undefined, embeds: [gameNightEmbed(g, list)], components: gameNightRows(g), allowedMentions: { roles: pingRoleId ? [pingRoleId] : [] } })
    .catch((err) => {
      logError("bot", err, g.guildId);
      return null;
    });
  if (!sent) return { ok: false, error: "Discord wouldn't take the post." };
  await prisma.gameNight.update({ where: { id: g.id }, data: { messageId: sent.id } });
  return { ok: true, url: sent.url };
}

async function makeTeams(client: Client, g: GameNight, announce: boolean) {
  const list = (await players(g.id)).map((p) => p.userId);
  if (list.length < 2) return { ok: false, error: "At least 2 players need to join first." };
  const teams = splitTeams(list, g.teamSize || list.length);
  const updated = await prisma.gameNight.update({ where: { id: g.id }, data: { teams, status: "TEAMS" } });
  await refreshPost(client, updated);
  if (announce) {
    const ch = await client.channels.fetch(g.channelId).catch(() => null);
    if (isSendableChannel(ch))
      await ch
        .send({
          content: `🎲 **${clean(g.game)}** teams:\n${teams.map((t, i) => `${TEAM_NAMES[i % TEAM_NAMES.length]}: ${t.map((u) => `<@${u}>`).join(" ")}`).join("\n")}`.slice(0, 2000),
          allowedMentions: { users: list },
        })
        .catch(() => null);
  }
  return { ok: true };
}

export async function handleGameNightButton(interaction: ButtonInteraction) {
  const [, , action, id] = interaction.customId.split(":");
  const g = await prisma.gameNight.findUnique({ where: { id } });
  if (!g || g.guildId !== interaction.guildId) {
    await interaction.reply({ content: "That game night is gone.", ephemeral: true });
    return;
  }
  if (!(await isModuleEnabled(g.guildId, "STREAM_GROWTH"))) {
    await interaction.reply({ content: "⚠️ Stream Growth is turned off in this server.", ephemeral: true });
    return;
  }
  if (g.status === "CANCELED" || g.status === "DONE") {
    await interaction.reply({ content: "That game night is over.", ephemeral: true });
    return;
  }
  const userId = interaction.user.id;
  const staff = interaction.memberPermissions?.has(PermissionFlagsBits.ManageEvents) || interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
  const boss = userId === g.hostId || staff;

  if (action === "join") {
    const count = await prisma.gameNightPlayer.count({ where: { gameNightId: id } });
    if (g.maxPlayers && count >= g.maxPlayers) {
      await interaction.reply({ content: "It's full, sorry!", ephemeral: true });
      return;
    }
    const added = await prisma.gameNightPlayer.create({ data: { gameNightId: id, userId } }).then(() => true).catch(() => false);
    await interaction.reply({ content: added ? `✅ You're in for **${clean(g.game)}** <t:${Math.floor(g.startAt.getTime() / 1000)}:R>. You'll get a ping 15 minutes before.` : "You're already in.", ephemeral: true });
  } else if (action === "leave") {
    const gone = await prisma.gameNightPlayer.deleteMany({ where: { gameNightId: id, userId } });
    // Leaving after the teams were made takes you off your team too.
    if (gone.count && Array.isArray(g.teams)) await prisma.gameNight.update({ where: { id }, data: { teams: (g.teams as string[][]).map((t) => t.filter((u) => u !== userId)) } });
    await interaction.reply({ content: gone.count ? "👋 You left the game night." : "You weren't signed up.", ephemeral: true });
  } else if (action === "teams") {
    if (!boss) {
      await interaction.reply({ content: "Only the host or staff can make the teams.", ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    const r = await makeTeams(interaction.client, g, true);
    await interaction.editReply(r.ok ? "🎲 Teams made. Press it again to reshuffle." : `⚠️ ${r.error}`);
    return;
  } else if (action === "cancel") {
    if (!boss) {
      await interaction.reply({ content: "Only the host or staff can cancel it.", ephemeral: true });
      return;
    }
    await prisma.gameNight.update({ where: { id }, data: { status: "CANCELED" } });
    await interaction.reply({ content: "❌ Game night cancelled.", ephemeral: true });
  }
  const fresh = await prisma.gameNight.findUnique({ where: { id } });
  if (fresh) await refreshPost(interaction.client, fresh);
}

// Every minute: reminders, teams at the start, and tidying up old ones.
export async function gameNightTick(client: Client) {
  const now = Date.now();
  const due = await prisma.gameNight.findMany({ where: { status: { in: ["OPEN", "TEAMS"] }, startAt: { lte: new Date(now + 15 * 60_000) } }, orderBy: { startAt: "asc" }, take: 50 });
  for (const g of due) {
    try {
      if (!(await isModuleEnabled(g.guildId, "STREAM_GROWTH"))) continue;
      const start = g.startAt.getTime();
      if (!g.remindedAt && start > now) {
        const claimed = await prisma.gameNight.updateMany({ where: { id: g.id, remindedAt: null }, data: { remindedAt: new Date() } });
        const list = (await players(g.id)).map((p) => p.userId);
        if (claimed.count && list.length) {
          const ch = await client.channels.fetch(g.channelId).catch(() => null);
          if (isSendableChannel(ch)) await ch.send({ content: `⏰ **${clean(g.game)}** starts <t:${Math.floor(start / 1000)}:R>! ${list.map((u) => `<@${u}>`).join(" ")}`.slice(0, 2000), allowedMentions: { users: list } }).catch(() => null);
        }
        continue;
      }
      if (start <= now && g.status === "OPEN") {
        const claimed = await prisma.gameNight.updateMany({ where: { id: g.id, status: "OPEN" }, data: { status: g.teamSize ? "TEAMS" : "DONE" } });
        if (!claimed.count) continue;
        if (g.teamSize) await makeTeams(client, g, true);
        else {
          const list = (await players(g.id)).map((p) => p.userId);
          const ch = await client.channels.fetch(g.channelId).catch(() => null);
          if (list.length && isSendableChannel(ch)) await ch.send({ content: `🎮 **${clean(g.game)}** is starting now! ${list.map((u) => `<@${u}>`).join(" ")}`.slice(0, 2000), allowedMentions: { users: list } }).catch(() => null);
          await refreshPost(client, { ...g, status: "DONE" });
        }
      } else if (now - start > 6 * 3600_000) {
        const done = await prisma.gameNight.update({ where: { id: g.id }, data: { status: "DONE" } });
        await refreshPost(client, done);
      }
    } catch (err) {
      logError("bot", err, g.guildId);
    }
  }
}
