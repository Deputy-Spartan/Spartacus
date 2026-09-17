import { Events, Message } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";

export const name = Events.MessageCreate;

const URL_PATTERN = /https?:\/\//i;

function shouldDelete(message: Message, lock: {
  allowImages: boolean;
  allowLinks: boolean;
  allowFiles: boolean;
  allowMessages: boolean;
  slashCommandsOnly: boolean;
  requiredPrefixes: unknown;
  bannedWords: unknown;
  allowedUserIds: unknown;
  allowedRoleIds: unknown;
}): boolean {
  // A non-empty sender allowlist is a hard gate checked before anything
  // else — being on it doesn't excuse a message from the content rules
  // below, but being off it means nothing else matters.
  const allowedUserIds = Array.isArray(lock.allowedUserIds) ? (lock.allowedUserIds as string[]) : [];
  const allowedRoleIds = Array.isArray(lock.allowedRoleIds) ? (lock.allowedRoleIds as string[]) : [];
  if (allowedUserIds.length > 0 || allowedRoleIds.length > 0) {
    const isAllowedUser = allowedUserIds.includes(message.author.id);
    const isAllowedRole = allowedRoleIds.length > 0 && !!message.member?.roles.cache.some((r) => allowedRoleIds.includes(r.id));
    if (!isAllowedUser && !isAllowedRole) return true;
  }

  const content = message.content;
  const hasImage = message.attachments.some((a) => (a.contentType ?? "").startsWith("image/"));
  const hasFile = message.attachments.some((a) => !(a.contentType ?? "").startsWith("image/"));
  const hasLink = URL_PATTERN.test(content);
  const hasText = content.trim().length > 0;

  const bannedWords = Array.isArray(lock.bannedWords) ? (lock.bannedWords as string[]) : [];
  if (bannedWords.some((w) => content.toLowerCase().includes(w.toLowerCase()))) return true;

  // A channel locked to slash commands only rejects every regular message
  // outright — interactions never fire messageCreate, so this can't
  // accidentally catch legitimate command usage.
  if (lock.slashCommandsOnly) return true;

  if (hasImage && !lock.allowImages) return true;
  if (hasFile && !lock.allowFiles) return true;
  if (hasLink && !lock.allowLinks) return true;

  if (hasText) {
    const prefixes = Array.isArray(lock.requiredPrefixes) ? (lock.requiredPrefixes as string[]) : [];
    if (prefixes.length > 0) {
      if (!prefixes.some((p) => content.startsWith(p))) return true;
    } else if (!lock.allowMessages) {
      return true;
    }
  }

  return false;
}

export async function execute(message: Message) {
  if (message.author.bot || !message.guildId) return;

  const enabled = await isModuleEnabled(message.guildId, "CHANNEL_LOCKS");
  if (!enabled) return;

  const lock = await prisma.channelLock.findUnique({ where: { channelId: message.channelId } });
  if (!lock) return;

  if (!shouldDelete(message, lock)) return;

  await message.delete().catch(() => null);
}
