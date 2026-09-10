import { Events, VoiceState } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { awardAchievement } from "../../lib/achievements";

export const name = Events.VoiceStateUpdate;

const VOICE_10H_MINUTES = 600;
const VOICE_50H_MINUTES = 3000;

export async function execute(oldState: VoiceState, newState: VoiceState) {
  const guildId = newState.guild.id;
  const enabled = await isModuleEnabled(guildId, "VOICE_ACTIVITY");
  if (!enabled) return;

  const member = newState.member ?? oldState.member;
  if (!member) return;

  const afkChannelId = newState.guild.afkChannelId;

  const joinedVoice =
    newState.channelId &&
    newState.channelId !== oldState.channelId &&
    newState.channelId !== afkChannelId;

  const leftVoiceOrWentAfk =
    oldState.channelId &&
    oldState.channelId !== newState.channelId &&
    (!newState.channelId || newState.channelId === afkChannelId);

  if (joinedVoice) {
    // If a session already exists (e.g. they switched channels without a
    // null gap, or a stray leftover), leave it as-is — it still counts as
    // one continuous session across channel switches within this guild.
    const existing = await prisma.voiceSession.findUnique({
      where: { guildId_userId: { guildId, userId: member.id } },
    });
    if (!existing) {
      await prisma.voiceSession.create({ data: { guildId, userId: member.id } });
    }
  }

  if (leftVoiceOrWentAfk) {
    // Note: if the bot crashed/restarted while this user's session was
    // open, the row was never created in this process's memory but WOULD
    // still exist in the DB from before the restart — that's fine, this
    // still resolves it correctly. The only unhandled edge case is a
    // session left dangling forever if the user disconnects while the bot
    // is down without ever coming back — it just never resolves into
    // VoiceActivity, which is an acceptable, documented gap.
    const session = await prisma.voiceSession.findUnique({
      where: { guildId_userId: { guildId, userId: member.id } },
    });
    if (session) {
      const minutes = Math.floor((Date.now() - session.joinedAt.getTime()) / 60000);
      await prisma.voiceSession.delete({ where: { id: session.id } }).catch(() => null);

      if (minutes > 0) {
        const before = await prisma.voiceActivity.findUnique({
          where: { guildId_userId: { guildId, userId: member.id } },
        });
        const prevTotal = before?.totalMinutes ?? 0;
        const activity = await prisma.voiceActivity.upsert({
          where: { guildId_userId: { guildId, userId: member.id } },
          create: { guildId, userId: member.id, totalMinutes: minutes },
          update: { totalMinutes: { increment: minutes } },
        });

        // Hook for the Achievements feature: award once when a member's
        // total crosses the 10h/50h thresholds for the first time.
        if (prevTotal < VOICE_10H_MINUTES && activity.totalMinutes >= VOICE_10H_MINUTES) {
          await awardAchievement(newState.client, guildId, member.id, "VOICE_10H", "10 Hours in Voice", oldState.channelId ?? undefined);
        }
        if (prevTotal < VOICE_50H_MINUTES && activity.totalMinutes >= VOICE_50H_MINUTES) {
          await awardAchievement(newState.client, guildId, member.id, "VOICE_50H", "50 Hours in Voice", oldState.channelId ?? undefined);
        }
      }
    }
  }
}
