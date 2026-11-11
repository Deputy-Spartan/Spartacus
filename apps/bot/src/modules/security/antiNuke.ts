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
  if (entry.executorId === guild.client.user.id || entry.executorId === guild.ownerId) return;

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
  let outcome = "";
  if (config.stripRolesOnTrigger) {
    // A bot's own role can't be removed, and including it fails the whole change.
    const roles = actor?.roles.cache.filter((r) => r.id !== guild.roles.everyone.id);
    const strippable = roles?.filter((r) => r.editable && !r.managed);
    const stripped = strippable ? await actor!.roles.remove(strippable).then(() => true, () => false) : false;
    outcome = stripped && strippable?.size === roles?.size ? "\nTheir roles have been stripped." : "\n⚠️ I couldn't strip all of their roles. Deal with them by hand now.";
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
                `<@${entry.executorId}> performed ${count} ${isBan ? "bans" : "channel deletions"} in under a minute.${outcome}`
              )
              .setTimestamp(),
          ],
        })
        .catch(() => null);
    }
  }
}
