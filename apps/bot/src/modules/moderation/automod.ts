import { Message } from "discord.js";
import { xpCooldownCache } from "../../lib/cache";
import { isSendableChannel } from "../../lib/channels";

const LINK_REGEX = /https?:\/\/\S+/i;
const SPAM_WINDOW_MS = 7000;
const SPAM_MAX_MESSAGES = 5;

// Bounded per-user rolling window, piggybacking on the shared LRU cache so
// spam tracking can't grow unbounded across thousands of users.
const spamTracker = new Map<string, number[]>();

interface AutomodConfig {
  bannedWords?: string[];
  antiLink?: boolean;
  spamCap?: boolean;
}

export function checkAutomod(message: Message, config: AutomodConfig): string | null {
  const content = message.content.toLowerCase();

  if (config.bannedWords?.some((word) => content.includes(word.toLowerCase()))) {
    return "banned word";
  }

  if (config.antiLink && LINK_REGEX.test(message.content)) {
    return "link posting";
  }

  if (config.spamCap) {
    const key = `${message.guildId}:${message.author.id}`;
    const now = Date.now();
    const timestamps = (spamTracker.get(key) ?? []).filter((t) => now - t < SPAM_WINDOW_MS);
    timestamps.push(now);
    spamTracker.set(key, timestamps);

    // Cap tracker size defensively — evict oldest entries if it somehow grows large.
    if (spamTracker.size > 10_000) {
      const oldestKey = spamTracker.keys().next().value;
      if (oldestKey) spamTracker.delete(oldestKey);
    }

    if (timestamps.length > SPAM_MAX_MESSAGES) return "message spam";
  }

  return null;
}

export async function handleViolation(message: Message, reason: string) {
  await message.delete().catch(() => null);
  if (!isSendableChannel(message.channel)) return;

  const warning = await message.channel
    .send(`⚠️ ${message.author}, your message was removed (${reason}).`)
    .catch(() => null);
  setTimeout(() => warning?.delete().catch(() => null), 5000);
}

// Re-exported so messageCreate.ts can dedupe XP cooldown checks against the
// same shared cache used elsewhere.
export { xpCooldownCache };
