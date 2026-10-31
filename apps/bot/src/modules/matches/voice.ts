import { ChannelType, Client, Guild, OverwriteResolvable, PermissionFlagsBits } from "discord.js";
import type { MatchmakingConfig } from "@prisma/client";
import { DEFAULT_DUEL_VOICE_NAME, DEFAULT_TEAM_VOICE_NAME, renderTextRoomName, renderVoiceName, resolveText, type TextOverrides, type VoiceNameValues } from "@spartacus/shared";
import { logError } from "@spartacus/db";

export interface VoiceSide {
  name: string;
  players: string[];
}

interface OpenOptions {
  guild: Guild;
  config: MatchmakingConfig | null;
  lobbyId: string | null;
  fallbackCategoryId: string | null;
  game: string;
  map: string | null;
  number: number;
  a: VoiceSide;
  b: VoiceSide;
  shared: boolean; // a 1v1 shares one channel, teams get one each
  texts: TextOverrides;
  categoryId?: string | null; // a setup's own category, ahead of the Voice tab's
}

const cap = (config: MatchmakingConfig | null, players: number) => {
  if (config?.voiceLimit === "NONE") return 0;
  return Math.min(99, players + (config?.voiceLimit === "EXTRA" ? config.voiceExtra : 0));
};

const roomNames = (config: MatchmakingConfig | null, values: VoiceNameValues, a: VoiceSide, b: VoiceSide, shared: boolean) =>
  shared
    ? [{ name: renderVoiceName(config?.duelVoiceName ?? DEFAULT_DUEL_VOICE_NAME, values), players: [...a.players, ...b.players] }]
    : [a, b].map((side) => ({ name: renderVoiceName(config?.teamVoiceName ?? DEFAULT_TEAM_VOICE_NAME, { ...values, team: side.name }), players: side.players }));

// Creates the match's voice channels and moves players in. A bot can only move
// someone already connected, so anyone else is returned to be sent a link.
export async function openVoiceRooms({ guild, config, lobbyId, fallbackCategoryId, game, map, number, a, b, shared, texts, categoryId }: OpenOptions) {
  const lobby = lobbyId ? await guild.channels.fetch(lobbyId).catch(() => null) : null;
  const main = lobby?.isVoiceBased() ? lobby : null;
  const parent = categoryId ?? (shared ? config?.duelCategoryId : config?.teamCategoryId) ?? main?.parentId ?? fallbackCategoryId ?? undefined;
  const values = { a: a.name, b: b.name, game, map, number, pad: config?.voiceNumberPad ?? 1 };
  const rooms = roomNames(config, values, a, b, shared);

  const voiceIds: string[] = [];
  const pings: string[] = [];
  const onlyLobby = (config?.voiceSource ?? "LOBBY") === "LOBBY" && !!main;
  for (const [index, room] of rooms.entries()) {
    const botId = guild.client.user.id;
    const privateRoom: OverwriteResolvable[] = [
      { id: guild.id, deny: [PermissionFlagsBits.Connect] },
      { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] },
      ...room.players.map((id) => ({ id, allow: [PermissionFlagsBits.Connect] })),
    ];
    const voice = await guild.channels
      .create({
        name: room.name,
        type: ChannelType.GuildVoice,
        parent,
        userLimit: cap(config, room.players.length),
        ...(config?.voicePrivate ? { permissionOverwrites: privateRoom } : main ? { permissionOverwrites: main.permissionOverwrites.cache } : {}),
      })
      .catch((err) => {
        logError("bot", err, guild.id);
        return null;
      });
    if (!voice) {
      pings.push(`I couldn't create the voice channel ${room.name}. Check that I have Manage Channels.`);
      continue;
    }
    voiceIds.push(voice.id);

    // Sharing the Lobby's category keeps a match right under it.
    if (main && main.parentId === voice.parentId) await voice.setPosition(main.position + 1 + index).catch(() => null);

    const missing: string[] = [];
    for (const id of room.players) {
      const member = await guild.members.fetch({ user: id, force: true }).catch(() => null);
      const canMove = onlyLobby ? member?.voice.channelId === main?.id : !!member?.voice.channelId;
      const moved = canMove ? await member!.voice.setChannel(voice.id).catch(() => null) : null;
      if (!moved) missing.push(id);
    }
    if (missing.length) pings.push(resolveText(texts, "pingVoice", { players: missing.map((id) => `<@${id}>`).join(" "), channel: `<#${voice.id}>` }).text);
  }
  return { voiceIds, pings };
}

interface TextRoomOptions extends Pick<OpenOptions, "guild" | "lobbyId" | "game" | "number" | "a" | "b" | "shared" | "categoryId"> {
  config: MatchmakingConfig;
  staffRoleId: string | null;
}

// The match's text channel sits with its voice channels. Only players and
// staff can write in it, and only they can see it unless everyone can read.
export async function openTextRoom({ guild, config, lobbyId, game, number, a, b, shared, categoryId, staffRoleId }: TextRoomOptions) {
  const lobby = lobbyId ? await guild.channels.fetch(lobbyId).catch(() => null) : null;
  const parent = categoryId ?? (shared ? config.duelCategoryId : config.teamCategoryId) ?? lobby?.parentId ?? undefined;
  const use = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory];
  const permissionOverwrites: OverwriteResolvable[] = [
    config.textRoomView === "ALL" ? { id: guild.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] } : { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: guild.client.user.id, allow: [...use, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageChannels] },
    ...[...a.players, ...b.players].map((id) => ({ id, allow: use })),
    ...(staffRoleId ? [{ id: staffRoleId, allow: use }] : []),
  ];
  return guild.channels.create({
    name: renderTextRoomName(config.textRoomName, { a: a.name, b: b.name, game, number, pad: config.voiceNumberPad }),
    type: ChannelType.GuildText,
    parent,
    permissionOverwrites,
  });
}

// Voice channels open before the map is picked, so names using it fill in later.
export async function nameVoiceForMap({ guild, config, game, map, number, a, b, shared }: Pick<OpenOptions, "guild" | "config" | "game" | "map" | "number" | "a" | "b" | "shared">, voiceIds: string[]) {
  if (!(shared ? config?.duelVoiceName : config?.teamVoiceName)?.includes("{map}")) return;
  const rooms = roomNames(config, { a: a.name, b: b.name, game, map, number, pad: config?.voiceNumberPad ?? 1 }, a, b, shared);
  for (const [index, id] of voiceIds.entries()) {
    const room = await guild.channels.fetch(id).catch(() => null);
    await room?.setName(rooms[index].name).catch((err) => logError("bot", err, guild.id));
  }
}

// A sub takes over the player's access to the match's channels.
export async function swapRoomAccess(guild: Guild, config: MatchmakingConfig | null, roomId: string | null, voiceIds: string[], out: string, sub: string) {
  const update = async (id: string, access: Record<string, boolean>) => {
    const room = await guild.channels.fetch(id).catch(() => null);
    if (!room || !("permissionOverwrites" in room)) return;
    await room.permissionOverwrites.edit(sub, access).catch((err) => logError("bot", err, guild.id));
    await room.permissionOverwrites.delete(out).catch(() => null);
  };
  if (roomId) await update(roomId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
  if (config?.voicePrivate) for (const id of voiceIds) await update(id, { Connect: true });
}

// Moves everyone back to the Lobby if that's on, then deletes the channels.
export async function closeVoiceRooms(client: Client, config: MatchmakingConfig | null, voiceIds: string[], lobbyId: string | null, guildId: string) {
  for (const id of voiceIds) {
    const room = await client.channels.fetch(id).catch(() => null);
    if (!room?.isVoiceBased()) continue;
    if (lobbyId && (config?.voiceReturn ?? true)) {
      for (const member of room.members.values()) await member.voice.setChannel(lobbyId).catch((err) => logError("bot", err, guildId));
    }
    await room.delete().catch((err) => logError("bot", err, guildId));
  }
}
