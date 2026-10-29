import { Events, GuildMember, ButtonInteraction } from "discord.js";
import { prisma } from "../lib/prisma";
import { isModuleEnabled } from "../lib/moduleGate";
import { buildWelcomePayload } from "../modules/community/welcomeRender";

export const name = Events.GuildMemberAdd;

// A gateway reconnect/resume around the moment someone joins (or, during a
// deploy, a brief overlap between the outgoing and incoming bot instance)
// can deliver the same join event twice. This makes the welcome send
// idempotent per join — keyed by member+guild+their actual join timestamp,
// so a genuine rejoin later (a new joinedTimestamp) still welcomes them
// again, only a true duplicate delivery of the same join is skipped.
const recentlyWelcomed = new Set<string>();
const DEDUPE_MS = 15_000;

export async function execute(member: GuildMember) {
  const dedupeKey = `${member.guild.id}:${member.id}:${member.joinedTimestamp ?? 0}`;
  if (recentlyWelcomed.has(dedupeKey)) return;
  recentlyWelcomed.add(dedupeKey);
  setTimeout(() => recentlyWelcomed.delete(dedupeKey), DEDUPE_MS);

  const enabled = await isModuleEnabled(member.guild.id, "WELCOME");
  if (!enabled) return;

  const config = await prisma.welcomeConfig.findUnique({ where: { guildId: member.guild.id } });
  if (!config?.channelId) return;

  const channel = await member.guild.channels.fetch(config.channelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  const payload = await buildWelcomePayload(member.guild, config, member);
  await channel.send(payload);
}

// A member clicks a greeting's wave button to publicly welcome whoever just
// joined — purely social, doesn't touch roles or settings, so any member
// can use it (not just staff). Ephemeral reply only to avoid flooding the
// welcome channel with one message per wave.
export async function handleWave(interaction: ButtonInteraction, targetUserId: string) {
  if (interaction.user.id === targetUserId) {
    await interaction.reply({ content: "You can't wave at yourself! 😄", ephemeral: true });
    return;
  }
  await interaction.reply({ content: `👋 You waved to welcome <@${targetUserId}>!`, ephemeral: true });
}

// Tracks the member for the Rules reminder job (apps/bot/src/jobs/rulesGateReminder.ts)
// so it can nudge whoever hasn't agreed yet without scanning the whole member list.
// Deleted the moment they agree (see modules/community/rulesGate.ts).
export async function onMemberJoin(member: GuildMember) {
  const enabled = await isModuleEnabled(member.guild.id, "RULES_GATE");
  if (!enabled) return;

  const settings = await prisma.rulesGateSettings.findUnique({ where: { guildId: member.guild.id } });
  if (!settings?.channelId || !settings.roleId) return;

  await prisma.rulesGatePendingMember
    .upsert({
      where: { guildId_userId: { guildId: member.guild.id, userId: member.id } },
      create: { guildId: member.guild.id, userId: member.id },
      update: { joinedAt: new Date(), remindedAt: null },
    })
    .catch(() => null);
}
