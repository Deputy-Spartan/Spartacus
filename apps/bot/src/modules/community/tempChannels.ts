import { ChannelType, Events, VoiceState, type Guild, type GuildMember, type VoiceChannel } from "discord.js";
import type { TempChannelLobby } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { cleanTempGameChoices, type TempGameChoice } from "@spartacus/shared";
import { tempChannelControls } from "./tempChannelControls";
import { gameCategory, nextTempName, removeEmptyGameCategory } from "./tempGameCategories";

export const name = Events.VoiceStateUpdate;

// Timers keyed by instance id, capped implicitly by the number of live temp
// channels — never grows unbounded since we clear on channel deletion.
const deleteTimers = new Map<string, ReturnType<typeof setTimeout>>();

export async function execute(oldState: VoiceState, newState: VoiceState) {
  const guildId = newState.guild.id;
  const enabled = await isModuleEnabled(guildId, "TEMP_CHANNELS");
  if (!enabled) return;

  if (newState.channelId && newState.channelId !== oldState.channelId) {
    await handleJoin(newState);
  }
  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    await handleLeaveCheck(oldState);
  }
}

// Makes a squad channel for a member, from either way in: joining the lobby
// voice channel, or picking a game on the panel. With a game it's named for
// that game, and with Group Squads by Game on it goes in that game's category.
export async function createSquad(guild: Guild, member: GuildMember, lobby: TempChannelLobby, game?: TempGameChoice): Promise<VoiceChannel | null> {
  const parentId = (game && lobby.gameCategories ? (await gameCategory(guild, lobby, game))?.id : null) ?? lobby.categoryId ?? null;
  const name = nextTempName(guild, parentId, game?.nameFormat ?? lobby.nameFormat, member.displayName);
  const created = await guild.channels
    .create({
      name,
      type: ChannelType.GuildVoice,
      parent: parentId ?? undefined,
      userLimit: game?.userLimit || lobby.userLimit || undefined,
      bitrate: lobby.bitrate || undefined,
    })
    .catch(() => null);
  if (!created) {
    await removeEmptyGameCategory(guild, parentId).catch(() => null);
    return null;
  }

  if (member.voice.channelId) await member.voice.setChannel(created.id).catch(() => null);
  // A game picked on the panel already named the channel, so it skips the game menu.
  const games = lobby.gamePicker && !game ? cleanTempGameChoices(lobby.gameChoices) : [];
  await created.send(tempChannelControls(created.id, games, member.id, game, lobby.guideButton)).catch(() => null);

  let textChannelId: string | undefined;
  if (lobby.pairTextChannel) {
    const textChannel = await guild.channels
      .create({
        name: `${name}-text`,
        type: ChannelType.GuildText,
        parent: parentId ?? undefined,
        permissionOverwrites: lobby.hideTextFromNonMembers
          ? [{ id: guild.roles.everyone.id, deny: ["ViewChannel"] }, { id: member.id, allow: ["ViewChannel"] }]
          : undefined,
      })
      .catch(() => null);
    textChannelId = textChannel?.id;
  }

  await prisma.tempChannelInstance.create({
    data: { guildId: guild.id, lobbyId: lobby.id, channelId: created.id, textChannelId, ownerId: member.id },
  });
  return created;
}

async function handleJoin(state: VoiceState) {
  const lobby = await prisma.tempChannelLobby.findFirst({
    where: { guildId: state.guild.id, lobbyChannelId: state.channelId as string },
  });
  if (!lobby || !state.member) return;
  await createSquad(state.guild, state.member, lobby);
}

// Deletes the squad channel after the lobby's wait if it's still empty, then
// its paired text channel, and its game category once that's empty too.
export async function scheduleEmptyCheck(guild: Guild, channelId: string, delaySec?: number) {
  const instance = await prisma.tempChannelInstance.findFirst({ where: { channelId } });
  if (!instance) return;
  const lobby = await prisma.tempChannelLobby.findUnique({ where: { id: instance.lobbyId } });
  const wait = delaySec ?? lobby?.deleteAfterEmptySec ?? 0;

  const key = instance.id;
  if (deleteTimers.has(key)) clearTimeout(deleteTimers.get(key));

  deleteTimers.set(
    key,
    setTimeout(async () => {
      deleteTimers.delete(key);
      const stillEmpty = await guild.channels.fetch(channelId).catch(() => null);
      if (stillEmpty && stillEmpty.isVoiceBased() && stillEmpty.members.size > 0) return;

      const parentId = stillEmpty?.parentId;
      await stillEmpty?.delete().catch(() => null);
      if (instance.textChannelId) {
        const textChannel = await guild.channels.fetch(instance.textChannelId).catch(() => null);
        await textChannel?.delete().catch(() => null);
      }
      await prisma.tempChannelInstance.delete({ where: { id: instance.id } }).catch(() => null);
      // The last squad in a game's category takes the category with it.
      await removeEmptyGameCategory(guild, parentId).catch(() => null);
    }, wait * 1000)
  );
}

async function handleLeaveCheck(state: VoiceState) {
  if (!state.channelId) return;
  const channel = await state.guild.channels.fetch(state.channelId).catch(() => null);
  if (!channel || !channel.isVoiceBased() || channel.members.size > 0) return;
  await scheduleEmptyCheck(state.guild, state.channelId);
}
