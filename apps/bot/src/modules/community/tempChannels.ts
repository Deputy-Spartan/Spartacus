import { ChannelType, Events, VoiceState } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";

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

async function handleJoin(state: VoiceState) {
  const lobby = await prisma.tempChannelLobby.findFirst({
    where: { guildId: state.guild.id, lobbyChannelId: state.channelId as string },
  });
  if (!lobby || !state.member) return;

  // {index} counts currently-active channels for this lobby, so numbering
  // stays tight (1, 2, 3…) rather than climbing forever as channels come
  // and go — matches how most "temp voice" bots number rooms.
  const activeCount = await prisma.tempChannelInstance.count({ where: { lobbyId: lobby.id } });
  const name = lobby.nameFormat
    .replace(/{user}/g, state.member.displayName)
    .replace(/{index}|{count}/g, String(activeCount + 1))
    .replace(/{guild}/g, state.guild.name);

  const created = await state.guild.channels
    .create({
      name,
      type: ChannelType.GuildVoice,
      parent: lobby.categoryId ?? undefined,
      userLimit: lobby.userLimit || undefined,
      bitrate: lobby.bitrate || undefined,
    })
    .catch(() => null);
  if (!created) return;

  await state.member.voice.setChannel(created.id).catch(() => null);

  let textChannelId: string | undefined;
  if (lobby.pairTextChannel) {
    const textChannel = await state.guild.channels
      .create({
        name: `${name}-text`,
        type: ChannelType.GuildText,
        parent: lobby.categoryId ?? undefined,
        permissionOverwrites: lobby.hideTextFromNonMembers
          ? [{ id: state.guild.roles.everyone.id, deny: ["ViewChannel"] }, { id: state.member.id, allow: ["ViewChannel"] }]
          : undefined,
      })
      .catch(() => null);
    textChannelId = textChannel?.id;
  }

  await prisma.tempChannelInstance.create({
    data: { guildId: state.guild.id, lobbyId: lobby.id, channelId: created.id, textChannelId, ownerId: state.member.id },
  });
}

async function handleLeaveCheck(state: VoiceState) {
  if (!state.channelId) return;
  const instance = await prisma.tempChannelInstance.findFirst({ where: { channelId: state.channelId } });
  if (!instance) return;

  const channel = await state.guild.channels.fetch(state.channelId).catch(() => null);
  if (!channel || !channel.isVoiceBased() || channel.members.size > 0) return;

  const lobby = await prisma.tempChannelLobby.findUnique({ where: { id: instance.lobbyId } });
  const delaySec = lobby?.deleteAfterEmptySec ?? 0;

  const key = instance.id;
  if (deleteTimers.has(key)) clearTimeout(deleteTimers.get(key));

  deleteTimers.set(
    key,
    setTimeout(async () => {
      deleteTimers.delete(key);
      const stillEmpty = await state.guild.channels.fetch(state.channelId as string).catch(() => null);
      if (stillEmpty && stillEmpty.isVoiceBased() && stillEmpty.members.size > 0) return;

      await stillEmpty?.delete().catch(() => null);
      if (instance.textChannelId) {
        const textChannel = await state.guild.channels.fetch(instance.textChannelId).catch(() => null);
        await textChannel?.delete().catch(() => null);
      }
      await prisma.tempChannelInstance.delete({ where: { id: instance.id } }).catch(() => null);
    }, delaySec * 1000)
  );
}
