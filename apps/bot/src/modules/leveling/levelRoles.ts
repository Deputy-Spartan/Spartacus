import { Guild } from "discord.js";
import { prisma } from "../../lib/prisma";

export async function grantLevelRoles(guild: Guild | null, userId: string, level: number) {
  if (!guild) return;

  const role = await prisma.levelRole.findUnique({ where: { guildId_level: { guildId: guild.id, level } } });
  if (!role) return;

  const member = await guild.members.fetch(userId).catch(() => null);
  await member?.roles.add(role.roleId).catch(() => null);
}
