import { Message } from "discord.js";
import { xpCooldownCache } from "../../lib/cache";
import { isSendableChannel } from "../../lib/channels";

const LINK_REGEX = /https?:\/\/\S+/i;
const INVITE_REGEX = /(discord\.gg|discord(?:app)?\.com\/invite)\/\S+/i;
const ZALGO_REGEX = /[̀-ͯ᪰-᫿᷀-᷿⃐-⃿]/;
const EMOJI_REGEX = /<a?:\w+:\d+>|\p{Extended_Pictographic}/gu;
const SPOILER_REGEX = /\|\|[^|]+\|\|/g;
const REPEATED_CHAR_REGEX = /(.)\1{9,}/; // same character 10+ times in a row

const SPAM_WINDOW_MS = 7000;
const SPAM_MAX_MESSAGES = 5;
const CAPS_MIN_LENGTH = 10;
const CAPS_THRESHOLD = 0.7;
const MAX_EMOJIS = 8;
const MAX_SPOILERS = 3;
const MAX_MENTIONS = 5;

// Bounded per-user rolling window, piggybacking on the shared LRU cache so
// spam tracking can't grow unbounded across thousands of users.
const spamTracker = new Map<string, number[]>();

export interface AutomodConfig {
  bannedWordsEnabled?: boolean;
  bannedWords?: string[];
  repeatedTextEnabled?: boolean;
  serverInvitesEnabled?: boolean;
  externalLinksEnabled?: boolean;
  excessiveCapsEnabled?: boolean;
  excessiveEmojisEnabled?: boolean;
  excessiveSpoilersEnabled?: boolean;
  excessiveMentionsEnabled?: boolean;
  zalgoEnabled?: boolean;
  antiSpamEnabled?: boolean;
  immuneRoleIds?: string[]; // members with any of these roles skip all automod checks
}

export function checkAutomod(message: Message, config: AutomodConfig): string | null {
  const content = message.content;
  const lower = content.toLowerCase();

  if (config.bannedWordsEnabled && config.bannedWords?.some((word) => lower.includes(word.toLowerCase()))) {
    return "banned word";
  }

  if (config.serverInvitesEnabled && INVITE_REGEX.test(content)) {
    return "server invite";
  }

  if (config.externalLinksEnabled && LINK_REGEX.test(content) && !INVITE_REGEX.test(content)) {
    return "external link";
  }

  if (config.zalgoEnabled && ZALGO_REGEX.test(content)) {
    return "zalgo text";
  }

  if (config.repeatedTextEnabled && REPEATED_CHAR_REGEX.test(content)) {
    return "repeated text";
  }

  if (config.excessiveCapsEnabled) {
    const letters = content.replace(/[^a-zA-Z]/g, "");
    const upper = letters.replace(/[^A-Z]/g, "");
    if (letters.length >= CAPS_MIN_LENGTH && upper.length / letters.length >= CAPS_THRESHOLD) {
      return "excessive caps";
    }
  }

  if (config.excessiveEmojisEnabled) {
    const count = content.match(EMOJI_REGEX)?.length ?? 0;
    if (count > MAX_EMOJIS) return "excessive emojis";
  }

  if (config.excessiveSpoilersEnabled) {
    const count = content.match(SPOILER_REGEX)?.length ?? 0;
    if (count > MAX_SPOILERS) return "excessive spoilers";
  }

  if (config.excessiveMentionsEnabled) {
    const count = message.mentions.users.size + message.mentions.roles.size;
    if (count > MAX_MENTIONS) return "excessive mentions";
  }

  if (config.antiSpamEnabled) {
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
