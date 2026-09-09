import cron from "node-cron";
import { Client, Message } from "discord.js";
import { prisma } from "../lib/prisma";
import { isModuleEnabled } from "../lib/moduleGate";

const URL_PATTERN = /https?:\/\//i;

function shouldSkip(
  message: Message,
  config: { ignorePinned: boolean; ignoreImages: boolean; ignoreLinks: boolean; protectedEmojis: unknown }
) {
  if (config.ignorePinned && message.pinned) return true;
  if (config.ignoreImages && message.attachments.some((a) => (a.contentType ?? "").startsWith("image/"))) return true;
  if (config.ignoreLinks && URL_PATTERN.test(message.content)) return true;

  const protectedEmojis = Array.isArray(config.protectedEmojis) ? (config.protectedEmojis as string[]) : [];
  if (protectedEmojis.length > 0) {
    const hasProtectedReaction = message.reactions.cache.some((r) => {
      const key = r.emoji.id ?? r.emoji.name ?? "";
      return protectedEmojis.includes(key);
    });
    if (hasProtectedReaction) return true;
  }

  return false;
}

// Runs every 10 minutes; each configured channel only actually purges once
// its own intervalMinutes has elapsed since lastRunAt. Pages backward
// through the channel deleting everything eligible up to Discord's 14-day
// bulk-delete boundary, skipping whatever the config says to protect.
export function startAutoPurgeJob(client: Client) {
  cron.schedule("*/10 * * * *", async () => {
    const configs = await prisma.autoPurgeConfig.findMany();

    for (const config of configs) {
      const dueAt = config.lastRunAt ? new Date(config.lastRunAt.getTime() + config.intervalMinutes * 60_000) : new Date(0);
      if (dueAt > new Date()) continue;

      const enabled = await isModuleEnabled(config.guildId, "MODERATION");
      if (!enabled) continue;

      const channel = await client.channels.fetch(config.channelId).catch(() => null);
      if (!channel || !channel.isTextBased() || channel.isDMBased() || !("bulkDelete" in channel)) continue;

      let lastId: string | undefined;
      let keepGoing = true;

      while (keepGoing) {
        const messages = await channel.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
        if (!messages || messages.size === 0) break;
        lastId = messages.last()?.id;

        const batch = [...messages.filter((m) => !shouldSkip(m, config)).values()];

        if (batch.length === 1) {
          await batch[0].delete().catch(() => null);
        } else if (batch.length > 1) {
          await channel.bulkDelete(batch, true).catch(() => null);
        }

        if (messages.size < 100) keepGoing = false; // reached the start of history
      }

      await prisma.autoPurgeConfig.update({ where: { id: config.id }, data: { lastRunAt: new Date() } });
    }
  });
}
