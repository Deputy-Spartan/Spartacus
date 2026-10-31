import { ChannelType, Client, Guild, OverwriteResolvable, PermissionFlagsBits } from "discord.js";
import type { MatchmakingConfig } from "@prisma/client";
import { DEFAULT_DUEL_VOICE_NAME, DEFAULT_TEAM_VOICE_NAME, renderVoiceName, resolveText } from "@spartacus/shared";
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
}

const cap = (config: MatchmakingConfig | null, players: number) => {
  if (config?.voiceLimit === "NONE") return 0;
  return Math.min(99, players + (config?.voiceLimit === "EXTRA" ? config.voiceExtra : 0));
};

// Creates the match's voice channels and moves players in. A bot can only move
// someone already connected, so anyone else is returned to be sent a link.
export async function openVoiceRooms({ guild, config, lobbyId, fallbackCategoryId, game, map, number, a, b, shared }: OpenOptions) {
  const lobby = lobbyId ? await guild.channels.fetch(lobbyId).catch(() => null) : null;
  const main = lobby?.isVoiceBased() ? lobby : null;
  const parent = config?.voiceCategoryId ?? main?.parentId ?? fallbackCategoryId ?? undefined;
  const values = { a: a.name, b: b.name, game, map, number, pad: config?.voiceNumberPad ?? 1 };
  const rooms = shared
    ? [{ name: renderVoiceName(config?.duelVoiceName ?? DEFAULT_DUEL_VOICE_NAME, values), players: [...a.players, ...b.players] }]
    : [a, b].map((side) => ({ name: renderVoiceName(config?.teamVoiceName ?? DEFAULT_TEAM_VOICE_NAME, { ...values, team: side.name }), players: side.players }));

  const voiceIds: string[] = [];
  const pings: string[] = [];
  const placement = config?.voicePlacement ?? "BELOW_LOBBY";
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

    if (placement === "TOP") await voice.setPosition(index).catch(() => null);
    else if (placement === "BELOW_LOBBY" && main && main.parentId === voice.parentId) await voice.setPosition(main.position + 1 + index).catch(() => null);

    const missing: string[] = [];
    for (const id of room.players) {
      const member = await guild.members.fetch({ user: id, force: true }).catch(() => null);
      const canMove = onlyLobby ? member?.voice.channelId === main?.id : !!member?.voice.channelId;
      const moved = canMove ? await member!.voice.setChannel(voice.id).catch(() => null) : null;
      if (!moved) missing.push(id);
    }
    if (missing.length) pings.push(resolveText(config?.texts, "pingVoice", { players: missing.map((id) => `<@${id}>`).join(" "), channel: `<#${voice.id}>` }).text);
  }
  return { voiceIds, pings };
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
