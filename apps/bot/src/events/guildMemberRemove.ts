import { Events, GuildMember, PartialGuildMember } from "discord.js";
import { prisma } from "../lib/prisma";
import { isModuleEnabled } from "../lib/moduleGate";
import { buildGoodbyePayload } from "../modules/community/welcomeRender";
import { claimEvent } from "../lib/eventClaims";

export const name = Events.GuildMemberRemove;

// Same reasoning as the join side (see guildMemberAdd.ts) — dedupes a
// double-delivered leave event rather than posting the goodbye twice.
const recentlyFarewelled = new Set<string>();
const DEDUPE_MS = 15_000;

export async function execute(member: GuildMember | PartialGuildMember) {
  const dedupeKey = `${member.guild.id}:${member.id}`;
  if (recentlyFarewelled.has(dedupeKey)) return;
  recentlyFarewelled.add(dedupeKey);
  setTimeout(() => recentlyFarewelled.delete(dedupeKey), DEDUPE_MS);

  const enabled = await isModuleEnabled(member.guild.id, "WELCOME");
  if (!enabled) return;

  const config = await prisma.welcomeConfig.findUnique({ where: { guildId: member.guild.id } });
  // Goodbyes can go to their own channel, like a staff log, instead of the welcome one.
  const channelId = config?.leaveChannelId ?? config?.channelId;
  if (!config || !channelId) return;

  const channel = await member.guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  // Keyed by the minute, so a second copy of the bot during a deploy stays quiet.
  if (!(await claimEvent(`goodbye:${dedupeKey}:${Math.floor(Date.now() / 60_000)}`))) return;
  const payload = await buildGoodbyePayload(member.guild, config, member);
  await channel.send(payload);
}
