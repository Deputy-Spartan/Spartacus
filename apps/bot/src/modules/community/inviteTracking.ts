import { Client, Collection, Events, Guild, GuildMember, Invite } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";

// One Collection<code, uses> per guild, refreshed on demand — bounded by
// how many invites a guild actually has, never unbounded growth.
const inviteCache = new Map<string, Collection<string, number>>();

export async function cacheGuildInvites(guild: Guild) {
  const invites = await guild.invites.fetch().catch(() => null);
  if (!invites) return;
  inviteCache.set(guild.id, new Collection(invites.map((inv) => [inv.code, inv.uses ?? 0])));
}

export async function primeAllGuildInvites(client: Client) {
  for (const guild of client.guilds.cache.values()) {
    const enabled = await isModuleEnabled(guild.id, "INVITE_TRACKING");
    if (enabled) await cacheGuildInvites(guild);
  }
}

export const name = Events.GuildMemberAdd;

export async function execute(member: GuildMember) {
  const enabled = await isModuleEnabled(member.guild.id, "INVITE_TRACKING");
  if (!enabled) return;

  const before = inviteCache.get(member.guild.id) ?? new Collection<string, number>();
  const after = await member.guild.invites.fetch().catch(() => null);
  if (!after) return;

  const usedInvite = after.find((inv) => (inv.uses ?? 0) > (before.get(inv.code) ?? 0));
  inviteCache.set(member.guild.id, new Collection(after.map((inv) => [inv.code, inv.uses ?? 0])));

  if (!usedInvite?.inviterId) return;

  await prisma.inviteStat.upsert({
    where: { guildId_inviterId: { guildId: member.guild.id, inviterId: usedInvite.inviterId } },
    create: { guildId: member.guild.id, inviterId: usedInvite.inviterId, uses: 1 },
    update: { uses: { increment: 1 } },
  });
}
