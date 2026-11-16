import { Guild } from "discord.js";
import { prisma } from "../../lib/prisma";

export async function grantLevelRoles(guild: Guild | null, userId: string, level: number) {
  if (!guild) return;

  const role = await prisma.levelRole.findUnique({ where: { guildId_level: { guildId: guild.id, level } } });
  if (!role) return;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;
  const added = await member.roles.add(role.roleId).then(() => true).catch(() => false);
  // Chat ranks (Stream Growth): only the highest one is worn.
  const gained = guild.roles.cache.get(role.roleId);
  if (added && gained) await import("../stream/ranks").then((m) => m.dropLowerRanks(member, gained)).catch(() => null);
}
