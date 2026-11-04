import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type Client,
  type Guild,
  type StringSelectMenuInteraction,
} from "discord.js";
import type { TempChannelLobby } from "@prisma/client";
import { logError } from "@spartacus/db";
import { cleanTempGameChoices } from "@spartacus/shared";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { menuOption } from "./tempChannelControls";
import { createSquad, scheduleEmptyCheck } from "./tempChannels";
import { tempGuideEmbed } from "./tempChannelGuide";

// The text channel way to make a squad: an embed with a game dropdown (or one
// button when the lobby has no games). Picking makes the voice channel, named
// for the game and in its category, the same as joining the lobby would.

// Someone who isn't in voice gets this long to join their new channel.
const JOIN_WINDOW_SEC = 120;

export function tempPanelPayload(lobby: TempChannelLobby, guild?: Guild | null) {
  const games = lobby.gamePicker ? cleanTempGameChoices(lobby.gameChoices) : [];
  const join = lobby.joinToCreate && lobby.lobbyChannelId ? `<#${lobby.lobbyChannelId}>` : "the Create a Squad voice channel";
  const text = (lobby.panelText || "").replace(/{lobby}/g, join);
  const embed = new EmbedBuilder().setColor(lobby.panelColor).setTitle(lobby.panelTitle || "🔊 Create a Squad");
  if (text) embed.setDescription(text.slice(0, 4000));
  const help = lobby.guideButton ? [new ButtonBuilder().setCustomId(`tvcp:${lobby.id}:help`).setLabel("How it works").setEmoji("❓").setStyle(ButtonStyle.Secondary)] : [];
  const rows = games.length
    ? [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder().setCustomId(`tvcp:${lobby.id}`).setPlaceholder("🎮 Pick your game to make a squad channel").addOptions(games.map(menuOption(guild))),
        ),
        ...(help.length ? [new ActionRowBuilder<ButtonBuilder>().addComponents(help)] : []),
      ]
    : [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`tvcp:${lobby.id}`).setLabel("Create a Squad").setEmoji("➕").setStyle(ButtonStyle.Primary),
          ...help,
        ),
      ];
  return { embeds: [embed], components: rows, allowedMentions: { parse: [] } };
}

// Posts the panel, or edits it in place when it's still there.
export async function syncTempPanel(client: Client, lobbyId: string) {
  const lobby = await prisma.tempChannelLobby.findUnique({ where: { id: lobbyId } });
  if (!lobby?.panelChannelId) return;
  const channel = await client.channels.fetch(lobby.panelChannelId).catch(() => null);
  if (!channel?.isTextBased() || !("send" in channel)) return;
  const payload = tempPanelPayload(lobby, "guild" in channel ? channel.guild : null);
  if (lobby.panelMessageId) {
    const message = await channel.messages.fetch(lobby.panelMessageId).catch(() => null);
    if (message) return void (await message.edit(payload));
  }
  const sent = await channel.send(payload);
  await prisma.tempChannelLobby.update({ where: { id: lobby.id }, data: { panelMessageId: sent.id } });
}

// On start, puts back any panel that was deleted while the bot was away.
export async function syncAllTempPanels(client: Client) {
  const lobbies = await prisma.tempChannelLobby.findMany({ where: { panelChannelId: { not: null } }, select: { id: true, guildId: true } });
  for (const l of lobbies) {
    if (!client.guilds.cache.has(l.guildId) || !(await isModuleEnabled(l.guildId, "TEMP_CHANNELS"))) continue;
    await syncTempPanel(client, l.id).catch((err) => logError("bot", err, l.guildId));
  }
}

// A link instead of a channel mention, since mentions show blank in private replies.
const link = (guildId: string, id: string, name: string) => `[🔊 ${name}](https://discord.com/channels/${guildId}/${id})`;

export async function handleTempPanel(interaction: StringSelectMenuInteraction | ButtonInteraction) {
  const [, lobbyId, action] = interaction.customId.split(":");
  const guild = interaction.guild;
  try {
    const lobby = await prisma.tempChannelLobby.findUnique({ where: { id: lobbyId } });
    if (!guild || !lobby || lobby.guildId !== guild.id) return void (await interaction.reply({ content: "This panel isn't set up anymore.", ephemeral: true }));
    if (action === "help") return void (await interaction.reply({ embeds: [tempGuideEmbed(guild, lobby)], ephemeral: true }));
    if (!(await isModuleEnabled(guild.id, "TEMP_CHANNELS"))) return void (await interaction.reply({ content: "⚠️ Temp Channels is turned off for this server.", ephemeral: true }));

    const game = interaction.isStringSelectMenu() ? cleanTempGameChoices(lobby.gameChoices)[Number(interaction.values[0])] : undefined;
    if (interaction.isStringSelectMenu() && !game) return void (await interaction.reply({ content: "That game was removed. Pick another one.", ephemeral: true }));
    await interaction.deferReply({ ephemeral: true });
    // Redraw the panel so the dropdown clears and the same game can be picked again.
    await interaction.message.edit(tempPanelPayload(lobby, guild)).catch(() => null);

    const member = await guild.members.fetch(interaction.user.id);
    // One squad at a time from the panel.
    const mine = await prisma.tempChannelInstance.findFirst({ where: { lobbyId, ownerId: member.id } });
    if (mine) {
      const channel = await guild.channels.fetch(mine.channelId).catch(() => null);
      if (channel) return void (await interaction.editReply(`You already have ${link(guild.id, channel.id, channel.name)}. Join it, or leave it empty and it's removed.`));
      await prisma.tempChannelInstance.delete({ where: { id: mine.id } }).catch(() => null);
    }

    const inVoice = !!member.voice.channelId;
    const squad = await createSquad(guild, member, lobby, game);
    if (!squad) return void (await interaction.editReply("That didn't work. Spartacus may need Manage Channels here."));
    // Removed if nobody is in it once the join window is up.
    await scheduleEmptyCheck(guild, squad.id, Math.max(JOIN_WINDOW_SEC, lobby.deleteAfterEmptySec));
    const where = squad.parent ? ` in **${squad.parent.name}**` : "";
    const made = await prisma.tempChannelInstance.findFirst({ where: { channelId: squad.id } });
    const controls = made?.controlsThreadId ? ` Your buttons are in [your squad thread](https://discord.com/channels/${guild.id}/${made.controlsThreadId}).` : "";
    await interaction.editReply(
      (inVoice
        ? `🎮 Made ${link(guild.id, squad.id, squad.name)}${where} and moved you in.`
        : `🎮 Made ${link(guild.id, squad.id, squad.name)}${where}. Join it within 2 minutes, or it's removed.`) + controls,
    );
  } catch (err) {
    logError("bot", err, interaction.guildId ?? undefined);
    if (interaction.deferred) await interaction.editReply("That didn't work. Spartacus may need Manage Channels here.").catch(() => null);
    else if (!interaction.replied) await interaction.reply({ content: "That didn't work. Spartacus may need Manage Channels here.", ephemeral: true }).catch(() => null);
  }
}
