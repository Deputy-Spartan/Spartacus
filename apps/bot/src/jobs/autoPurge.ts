import cron from "node-cron";
import { Client, Message } from "discord.js";
import { prisma } from "../lib/prisma";
import { logError } from "@spartacus/db";
import { isModuleEnabled } from "../lib/moduleGate";

const URL_PATTERN = /https?:\/\//i;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

function shouldSkip(
  message: Message,
  config: { ignorePinned: boolean; ignoreImages: boolean; ignoreLinks: boolean; protectedEmojis: unknown }
) {
  if (config.ignorePinned && message.pinned) return true;
  if (config.ignoreImages && message.attachments.some((a) => (a.contentType ?? "").startsWith("image/"))) return true;
  if (config.ignoreLinks && URL_PATTERN.test(message.content)) return true;

  // Server emojis are saved as <:name:id> but reactions report the id, and a
  // standard emoji may or may not carry the U+FE0F variation selector.
  const keyOf = (e: string) => (e.match(/^<a?:\w+:(\d+)>$/)?.[1] ?? e).replace(/\uFE0F/g, "");
  const protectedEmojis = Array.isArray(config.protectedEmojis) ? (config.protectedEmojis as string[]).map(keyOf) : [];
  if (protectedEmojis.length > 0) {
    const hasProtectedReaction = message.reactions.cache.some((r) => {
      const key = keyOf(r.emoji.id ?? r.emoji.name ?? "");
      return protectedEmojis.includes(key);
    });
    if (hasProtectedReaction) return true;
  }

  return false;
}

// Runs every minute; each configured channel only actually purges once its
// own intervalSeconds has elapsed since lastRunAt. That 1-minute tick is
// the real floor on resolution — an interval configured shorter than that
// still only ever fires on the next tick, never more often. Pages backward
// through the channel deleting everything eligible up to Discord's 14-day
// bulk-delete boundary, skipping whatever the config says to protect.
export function startAutoPurgeJob(client: Client) {
  cron.schedule("* * * * *", async () => {
    let loggedThisTick = 0;
    const configs = await prisma.autoPurgeConfig.findMany();

    for (const config of configs) {
      const dueAt = config.lastRunAt ? new Date(config.lastRunAt.getTime() + config.intervalSeconds * 1000) : new Date(0);
      if (dueAt > new Date()) continue;

      const enabled = await isModuleEnabled(config.guildId, "MODERATION");
      if (!enabled) continue;

      const channel = await client.channels.fetch(config.channelId).catch(() => null);
      if (!channel || !channel.isTextBased() || channel.isDMBased() || !("bulkDelete" in channel)) continue;

      // Stamped first so a slow run can't start again on the next tick.
      await prisma.autoPurgeConfig.update({ where: { id: config.id }, data: { lastRunAt: new Date() } });

      let lastId: string | undefined;
      let keepGoing = true;

      while (keepGoing) {
        const messages = await channel.messages.fetch({ limit: 100, before: lastId }).catch((err) => {
          if (loggedThisTick < 5) { logError("bot", err, config.guildId); loggedThisTick++; }
          return null;
        });
        if (!messages || messages.size === 0) break;
        lastId = messages.last()?.id;

        const batch = [...messages.filter((m) => !shouldSkip(m, config)).values()];

        if (batch.length === 1) {
          await batch[0].delete().catch((err) => {
            if (loggedThisTick < 5) { logError("bot", err, config.guildId); loggedThisTick++; }
          });
        } else if (batch.length > 1) {
          await channel.bulkDelete(batch, true).catch((err) => {
            if (loggedThisTick < 5) { logError("bot", err, config.guildId); loggedThisTick++; }
          });
        }

        if (messages.size < 100) keepGoing = false; // reached the start of history
        if (Date.now() - (messages.last()?.createdTimestamp ?? 0) >= FOURTEEN_DAYS_MS) keepGoing = false; // the rest can't be bulk-deleted
      }
    }
  });
}
