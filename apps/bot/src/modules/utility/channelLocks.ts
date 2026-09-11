import { Events, Message } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { isSendableChannel } from "../../lib/channels";
import { buildStickyPayload } from "../../lib/stickyRender";
import type { ChannelLock } from "@spartacus/db";

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
}): boolean {
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

async function buildNotifyPayload(lock: ChannelLock, message: Message) {
  const content = (lock.notifyContent || "{user}, that message isn't allowed in {channel}.")
    .replace(/{user}/g, `${message.author}`)
    .replace(/{channel}/g, `<#${message.channelId}>`);

  return buildStickyPayload({
    content,
    embedEnabled: lock.notifyEmbedEnabled,
    embedTitle: lock.notifyEmbedTitle,
    embedDescription: content,
    embedColor: lock.notifyEmbedColor,
    buttons: lock.notifyButtons,
  });
}

export async function execute(message: Message) {
  if (message.author.bot || !message.guildId) return;

  const enabled = await isModuleEnabled(message.guildId, "CHANNEL_LOCKS");
  if (!enabled) return;

  const lock = await prisma.channelLock.findUnique({ where: { channelId: message.channelId } });
  if (!lock) return;

  if (!shouldDelete(message, lock)) return;

  await message.delete().catch(() => null);
  if (!lock.notifyEnabled) return;

  const payload = await buildNotifyPayload(lock, message);

  if (isSendableChannel(message.channel)) {
    const sent = await message.channel.send(payload).catch(() => null);
    if (sent && lock.notifyDeleteAfterSec > 0) {
      setTimeout(() => sent.delete().catch(() => null), lock.notifyDeleteAfterSec * 1000);
    }
  }

  if (lock.dmUser) {
    await message.author.send(payload).catch(() => null); // silently drop if the member has DMs closed
  }
}
