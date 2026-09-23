import { Client, EmbedBuilder } from "discord.js";
import { prisma } from "./prisma";
import { isModuleEnabled } from "./moduleGate";
import { isSendableChannel } from "./channels";

// A configured Achievement Announcements channel always wins; without one,
// this falls back to wherever the triggering event happened (a message, a
// voice disconnect, etc.), passed in by the caller as `fallbackChannelId`.
// If neither exists (e.g. a cron-driven trigger with no channel context),
// the award still records silently — no message sent.
export async function awardAchievement(
  client: Client,
  guildId: string,
  userId: string,
  type: string,
  label: string,
  fallbackChannelId?: string
): Promise<boolean> {
  const enabled = await isModuleEnabled(guildId, "ACHIEVEMENTS");
  if (!enabled) return false;

  try {
    await prisma.achievement.create({ data: { guildId, userId, type } });
  } catch (err: unknown) {
    // P2002 = unique constraint violation — this achievement was already
    // awarded to this user in this guild. Cheaper than a SELECT-then-insert
    // race, and exactly what the @@unique([guildId, userId, type]) is for.
    if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2002") {
      return false;
    }
    throw err;
  }

  const settings = await prisma.achievementSettings.findUnique({ where: { guildId } });
  const channelId = settings?.channelId || fallbackChannelId;
  if (channelId) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (channel && isSendableChannel(channel)) {
      const embed = new EmbedBuilder()
        .setColor(0xffd700)
        .setDescription(`🏆 <@${userId}> earned the achievement: **${label}**!`);
      await channel.send({ embeds: [embed] }).catch(() => null);
    }
  }

  return true;
}

// Custom, server-defined achievements riding the same built-in triggers
// (level reached, hours in voice, daily-claim streak) but at whatever
// threshold the admin picked — checked alongside the hardcoded milestones
// wherever those already fire.
export async function checkCustomAchievements(
  client: Client,
  guildId: string,
  userId: string,
  triggerType: "LEVEL" | "VOICE_HOURS" | "DAILY_STREAK",
  currentValue: number,
  fallbackChannelId?: string
): Promise<void> {
  const matches = await prisma.customAchievement.findMany({
    where: { guildId, triggerType, threshold: { lte: currentValue } },
  });
  for (const a of matches) {
    await awardAchievement(client, guildId, userId, `CUSTOM:${a.id}`, `${a.emoji} ${a.name}`, fallbackChannelId);
  }
}
