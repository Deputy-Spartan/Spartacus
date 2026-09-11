import { Events, Message } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { isSendableChannel } from "../../lib/channels";
import { buildStickyPayload } from "../../lib/stickyRender";
import { resolveSavedEmbed } from "../../lib/savedEmbedRender";

export const name = Events.MessageCreate;

// Debounced per channel — if messages are flying in fast, every one of them
// would otherwise race to read the same lastMessageId and each post its own
// repost (the "doubled sticky" bug). Waiting for a short quiet period after
// the last message means only one repost fires per burst.
const DEBOUNCE_MS = 1500;
const pendingTimers = new Map<string, NodeJS.Timeout>();
const inFlight = new Set<string>(); // channelId currently mid-repost, guards against overlap with a fresh debounce firing

// Runs alongside the other messageCreate handler (automod/XP/custom
// commands) — discord.js supports multiple listeners on the same event,
// so this stays a separate, focused module rather than one giant handler.
export async function execute(message: Message) {
  if (message.author.bot || !message.guildId) return;
  const enabled = await isModuleEnabled(message.guildId, "STICKY_MESSAGES");
  if (!enabled) return;

  const sticky = await prisma.stickyMessage.findUnique({ where: { channelId: message.channelId } });
  if (!sticky) return;
  if (!isSendableChannel(message.channel)) return;

  const channel = message.channel;
  const existing = pendingTimers.get(message.channelId);
  if (existing) clearTimeout(existing);

  pendingTimers.set(
    message.channelId,
    setTimeout(() => {
      pendingTimers.delete(message.channelId);
      void repost(message.channelId, channel);
    }, DEBOUNCE_MS)
  );
}

async function repost(channelId: string, channel: Message["channel"]) {
  if (inFlight.has(channelId)) return; // a repost is already running for this channel; the debounce will catch anything newer
  inFlight.add(channelId);

  try {
    const sticky = await prisma.stickyMessage.findUnique({ where: { channelId } });
    if (!sticky || !isSendableChannel(channel)) return;

    if (sticky.lastMessageId) {
      const old = await channel.messages.fetch(sticky.lastMessageId).catch(() => null);
      await old?.delete().catch(() => null);
    }

    const saved = await resolveSavedEmbed(sticky.savedEmbedId);
    const posted = await channel.send(buildStickyPayload(sticky, { savedEmbed: saved })).catch(() => null);
    if (posted) {
      await prisma.stickyMessage.update({ where: { id: sticky.id }, data: { lastMessageId: posted.id } });
    }
  } finally {
    inFlight.delete(channelId);
  }
}
