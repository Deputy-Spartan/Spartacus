import { EmbedBuilder, Events, GuildMember, PermissionFlagsBits } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { isSendableChannel } from "../../lib/channels";

export const name = Events.GuildMemberAdd;

// Bounded per-guild join timestamp window — capped list length so a single
// guild can never grow this past a few dozen entries in memory.
const joinWindows = new Map<string, number[]>();
const MAX_TRACKED_JOINS = 50;

export async function execute(member: GuildMember) {
  const guildId = member.guild.id;
  const enabled = await isModuleEnabled(guildId, "ANTI_RAID");
  if (!enabled) return;

  const config = await prisma.antiRaidConfig.findUnique({ where: { guildId } });
  if (!config) return;

  const now = Date.now();
  const windowMs = config.joinRateWindowSec * 1000;
  const timestamps = (joinWindows.get(guildId) ?? []).filter((t) => now - t < windowMs);
  timestamps.push(now);
  joinWindows.set(guildId, timestamps.slice(-MAX_TRACKED_JOINS));

  const accountAgeDays = (now - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
  const isYoungAccount = accountAgeDays < config.minAccountAgeDays;

  const raidDetected = timestamps.length >= config.joinRateLimit;

  if (raidDetected && isYoungAccount) {
    await member.kick("Anti-raid: new-account filter during detected raid").catch(() => null);
  }

  if (raidDetected && config.alertChannelId) {
    const channel = await member.guild.channels.fetch(config.alertChannelId).catch(() => null);
    if (isSendableChannel(channel)) {
      await channel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xfb7185)
              .setTitle("⚠️ Possible raid detected")
              .setDescription(
                `${timestamps.length} members joined within ${config.joinRateWindowSec}s.` +
                  (config.autoLockdown ? "\nAuto-lockdown is enabled and has been triggered." : "")
              )
              .setTimestamp(),
          ],
        })
        .catch(() => null);
    }

    if (config.autoLockdown) {
      await lockdownGuild(member.guild);
    }
  }
}

export async function lockdownGuild(guild: import("discord.js").Guild) {
  const everyone = guild.roles.everyone;
  const channels = await guild.channels.fetch();
  for (const channel of channels.values()) {
    if (!channel || !channel.isTextBased() || channel.isThread()) continue;
    await channel.permissionOverwrites
      .edit(everyone, { SendMessages: false }, { reason: "Anti-raid auto-lockdown" })
      .catch(() => null);
  }
}
