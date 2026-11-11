import { ChannelType, type CategoryChannel, type Guild, type VoiceChannel } from "discord.js";
import { fillTempName, type TempGameChoice } from "@spartacus/shared";
import { prisma } from "../../lib/prisma";

// Squads grouped by game: picking a game moves the squad channel into a
// category for that game, made the first time it's needed and deleted once
// its last squad is gone. Only categories made here are ever deleted.

// One create at a time per game, so two people picking R6 together share a category.
const creating = new Map<string, Promise<CategoryChannel | null>>();

export async function gameCategory(guild: Guild, lobby: { id: string; categoryId: string | null }, game: TempGameChoice): Promise<CategoryChannel | null> {
  const key = `${lobby.id}:${game.label.toLowerCase()}`;
  const pending = creating.get(key);
  if (pending) return pending;
  const work = (async () => {
    const row = await prisma.tempGameCategory.findUnique({ where: { lobbyId_label: { lobbyId: lobby.id, label: game.label.toLowerCase() } } });
    const existing = row && (await guild.channels.fetch(row.categoryId).catch(() => null));
    if (existing?.type === ChannelType.GuildCategory) return existing as CategoryChannel;

    // Same look and access as the category the lobby makes squads in, placed right under it.
    const home = lobby.categoryId ? await guild.channels.fetch(lobby.categoryId).catch(() => null) : null;
    const name = fillTempName(`${game.emoji ?? ""} ${game.label}`, { user: "", index: 1, guild: guild.name }) || game.label;
    const category = await guild.channels
      .create({
        name,
        type: ChannelType.GuildCategory,
        permissionOverwrites: home?.type === ChannelType.GuildCategory ? [...home.permissionOverwrites.cache.values()] : undefined,
      })
      .catch(() => null);
    if (!category) return null;
    if (home?.type === ChannelType.GuildCategory) await category.setPosition(home.position + 1).catch(() => null);
    if (row) await prisma.tempGameCategory.update({ where: { id: row.id }, data: { categoryId: category.id } });
    else await prisma.tempGameCategory.create({ data: { guildId: guild.id, lobbyId: lobby.id, label: game.label.toLowerCase(), categoryId: category.id } });
    return category;
  })();
  creating.set(key, work);
  try {
    return await work;
  } finally {
    creating.delete(key);
  }
}

// Moves the squad (and its paired text channel) into its game's category,
// keeping its own permissions so a locked squad stays locked.
export async function moveToGameCategory(channel: VoiceChannel, lobby: { id: string; categoryId: string | null }, game: TempGameChoice, textChannelId?: string | null) {
  const category = await gameCategory(channel.guild, lobby, game);
  if (!category || channel.parentId === category.id) return;
  const from = channel.parentId;
  await channel.setParent(category.id, { lockPermissions: false });
  if (textChannelId) {
    const text = await channel.guild.channels.fetch(textChannelId).catch(() => null);
    if (text && "setParent" in text) await text.setParent(category.id, { lockPermissions: false }).catch(() => null);
  }
  await removeEmptyGameCategory(channel.guild, from);
}

// Deletes a game category once nothing is left in it.
export async function removeEmptyGameCategory(guild: Guild, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const row = await prisma.tempGameCategory.findUnique({ where: { categoryId } });
  if (!row) return;
  const category = await guild.channels.fetch(categoryId).catch(() => null);
  if (category?.type === ChannelType.GuildCategory && category.children.cache.size > 0) return;
  await category?.delete().catch(() => null);
  await prisma.tempGameCategory.delete({ where: { id: row.id } }).catch(() => null);
}

// The lowest free number for {index} among the channels in a category, so
// two R6 squads are 1 and 2, not 2 and 2.
export function nextTempName(guild: Guild, parentId: string | null, format: string, user: string, skipId?: string): string {
  const taken = new Set(guild.channels.cache.filter((c) => c.id !== skipId && c.parentId === parentId).map((c) => c.name.toLowerCase()));
  for (let n = 1; ; n++) {
    const name = fillTempName(format, { user, index: n, guild: guild.name });
    if (!/{index}|{count}/.test(format) || !taken.has(name.toLowerCase()) || n >= 99) return name;
  }
}
