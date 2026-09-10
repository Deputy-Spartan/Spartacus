import { Client, EmbedBuilder } from "discord.js";
import { prisma } from "./prisma";
import { isModuleEnabled } from "./moduleGate";
import { isSendableChannel } from "./channels";

// No dedicated "achievement announcement channel" field exists anywhere in
// the schema (WelcomeConfig.channelId is welcome/goodbye-only, LevelRole has
// no channel at all). Rather than invent new schema (explicitly out of
// scope for this task), we just announce into the channel the triggering
// event happened in, passed by the caller as `fallbackChannelId`. If the
// caller has no channel context (e.g. a cron-driven trigger), pass
// undefined and the award still records silently — no message sent.
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

  if (fallbackChannelId) {
    const channel = await client.channels.fetch(fallbackChannelId).catch(() => null);
    if (channel && isSendableChannel(channel)) {
      const embed = new EmbedBuilder()
        .setColor(0xffd700)
        .setDescription(`🏆 <@${userId}> earned the achievement: **${label}**!`);
      await channel.send({ embeds: [embed] }).catch(() => null);
    }
  }

  return true;
}
