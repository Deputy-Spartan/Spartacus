import { AuditLogEvent, EmbedBuilder, Events, Guild, GuildAuditLogsEntry, PermissionFlagsBits } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { isSendableChannel } from "../../lib/channels";

export const name = Events.GuildAuditLogEntryCreate;

// Bounded per-guild, per-actor action counters — capped map size so this
// can never grow past a handful of entries per guild.
const actorActions = new Map<string, number[]>();
const MAX_TRACKED = 30;

function trackAndCount(key: string, windowMs: number): number {
  const now = Date.now();
  const timestamps = (actorActions.get(key) ?? []).filter((t) => now - t < windowMs);
  timestamps.push(now);
  actorActions.set(key, timestamps.slice(-MAX_TRACKED));
  return timestamps.length;
}

export async function execute(entry: GuildAuditLogsEntry, guild: Guild) {
  const enabled = await isModuleEnabled(guild.id, "ANTI_NUKE");
  if (!enabled) return;
  if (!entry.executorId) return;

  const isBan = entry.action === AuditLogEvent.MemberBanAdd;
  const isChannelDelete = entry.action === AuditLogEvent.ChannelDelete;
  if (!isBan && !isChannelDelete) return;

  const config = await prisma.antiNukeConfig.findUnique({ where: { guildId: guild.id } });
  if (!config) return;

  const threshold = isBan ? config.maxBansPerMinute : config.maxChannelDeletesPerMinute;
  const key = `${guild.id}:${entry.executorId}:${isBan ? "ban" : "delete"}`;
  const count = trackAndCount(key, 60_000);

  if (count < threshold) return;

  const actor = await guild.members.fetch(entry.executorId).catch(() => null);
  if (actor && config.stripRolesOnTrigger) {
    const strippable = actor.roles.cache.filter((r) => r.id !== guild.roles.everyone.id);
    await actor.roles.remove(strippable).catch(() => null);
  }

  if (config.alertChannelId) {
    const channel = await guild.channels.fetch(config.alertChannelId).catch(() => null);
    if (isSendableChannel(channel)) {
      await channel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xfb7185)
              .setTitle("🚨 Anti-Nuke triggered")
              .setDescription(
                `<@${entry.executorId}> performed ${count} ${isBan ? "bans" : "channel deletions"} in under a minute.` +
                  (config.stripRolesOnTrigger ? "\nTheir roles have been stripped." : "")
              )
              .setTimestamp(),
          ],
        })
        .catch(() => null);
    }
  }
}
