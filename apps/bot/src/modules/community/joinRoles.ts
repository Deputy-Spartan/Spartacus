import { Events, GuildMember } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";

export const name = Events.GuildMemberAdd;

export async function execute(member: GuildMember) {
  const enabled = await isModuleEnabled(member.guild.id, "JOIN_ROLES");
  if (!enabled) return;

  const roles = await prisma.joinRole.findMany({ where: { guildId: member.guild.id } });
  if (roles.length === 0) return;

  await member.roles.add(roles.map((r) => r.roleId)).catch(() => null);
}
