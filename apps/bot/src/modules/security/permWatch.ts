import { AuditLogEvent, EmbedBuilder, Events, Guild, GuildAuditLogsEntry } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { isSendableChannel } from "../../lib/channels";

export const name = Events.GuildAuditLogEntryCreate;

const ADMIN_BIT = 1n << 3n; // Administrator permission bit

export async function execute(entry: GuildAuditLogsEntry, guild: Guild) {
  if (entry.action !== AuditLogEvent.RoleUpdate) return;

  const enabled = await isModuleEnabled(guild.id, "PERM_WATCH");
  if (!enabled) return;

  const permsChange = entry.changes.find((c) => c.key === "permissions");
  if (!permsChange) return;

  const config = await prisma.permWatchConfig.findUnique({ where: { guildId: guild.id } });
  if (!config?.alertChannelId) return;

  const channel = await guild.channels.fetch(config.alertChannelId).catch(() => null);
  if (!isSendableChannel(channel)) return;

  const before = BigInt((permsChange.old as string | undefined) ?? "0");
  const after = BigInt((permsChange.new as string | undefined) ?? "0");
  const gainedAdmin = (before & ADMIN_BIT) === 0n && (after & ADMIN_BIT) !== 0n;

  await channel
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(gainedAdmin ? 0xfb7185 : 0xfbbf24)
          .setTitle(gainedAdmin ? "🚨 Role granted Administrator" : "⚠️ Role permissions changed")
          .setDescription(`Role <@&${entry.targetId}> permissions were changed by <@${entry.executorId}>.`)
          .setTimestamp(),
      ],
    })
    .catch(() => null);
}
