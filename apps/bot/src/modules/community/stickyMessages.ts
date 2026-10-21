import { Client, Events, Message } from "discord.js";
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

// Suppresses the bot's own messages in a channel for a few seconds right
// after *we* post into it — set synchronously before the delete+send even
// starts, not after. An ID-matching guard set only after send() resolves
// (the previous approach here) is a real race under load: on a busy channel
// — another feature posting its own messages too, DB latency under load,
// whatever — the gateway's MESSAGE_CREATE for our own new message can beat
// that guard into place, and execute() then treats its own repost as "a new
// message landed here," queues another repost, and the sticky spams itself.
// A time window set *before* sending closes that race unconditionally: it's
// already active by the time any echo could possibly arrive.
const REPOST_SUPPRESS_MS = 5000;
const suppressUntil = new Map<string, number>();

// Runs alongside the other messageCreate handler (automod/XP/custom
// commands) — discord.js supports multiple listeners on the same event,
// so this stays a separate, focused module rather than one giant handler.
export async function execute(message: Message) {
  if (!message.guildId) return;
  const enabled = await isModuleEnabled(message.guildId, "STICKY_MESSAGES");
  if (!enabled) return;

  const sticky = await prisma.stickyMessage.findUnique({ where: { channelId: message.channelId } });
  if (!sticky) return;

  // Only the bot's own messages can ever be the sticky's own echo — a real
  // member's message always falls through to the debounce below regardless
  // of this window.
  const isOwnMessage = message.author.id === message.client.user?.id;
  if (isOwnMessage) {
    const until = suppressUntil.get(message.channelId) ?? 0;
    if (Date.now() < until || message.id === sticky.lastMessageId) return;
  }
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

// Used by the dashboard's "Resend Now" button (see apps/api's sticky-messages
// route) so a manual resend goes through the exact same delete+send+guard
// logic as the automatic repost above, instead of posting via a raw Discord
// REST call the `suppressUntil`/`inFlight` guards above have no way to see.
export async function forceRepost(client: Client, stickyId: string): Promise<{ ok: boolean; error?: string }> {
  const sticky = await prisma.stickyMessage.findUnique({ where: { id: stickyId } });
  if (!sticky) return { ok: false, error: "Sticky message not found" };

  const channel = await client.channels.fetch(sticky.channelId).catch(() => null);
  if (!isSendableChannel(channel)) return { ok: false, error: "Channel is not postable" };

  await repost(sticky.channelId, channel);
  return { ok: true };
}

async function repost(channelId: string, channel: Message["channel"]) {
  if (inFlight.has(channelId)) return; // a repost is already running for this channel; the debounce will catch anything newer
  inFlight.add(channelId);

  // Set before anything Discord-facing even starts — by the time delete()
  // and send() run (and any echo of either could reach the gateway),
  // suppression is already in effect. No race to lose.
  suppressUntil.set(channelId, Date.now() + REPOST_SUPPRESS_MS);

  try {
    const sticky = await prisma.stickyMessage.findUnique({ where: { channelId } });
    if (!sticky || !isSendableChannel(channel)) return;

    if (sticky.lastMessageId) {
      const old = await channel.messages.fetch(sticky.lastMessageId).catch(() => null);
      await old?.delete().catch(() => null);
    }

    const saved = await resolveSavedEmbed(sticky.savedEmbedId);
    const posted = await channel.send(await buildStickyPayload(sticky, { savedEmbed: saved, guildId: sticky.guildId })).catch(() => null);
    if (posted) {
      // Extend the window to cover the DB write too, then let the real
      // lastMessageId check in execute() take over once this expires.
      suppressUntil.set(channelId, Date.now() + REPOST_SUPPRESS_MS);
      await prisma.stickyMessage.update({ where: { id: sticky.id }, data: { lastMessageId: posted.id } });
    }
  } finally {
    inFlight.delete(channelId);
  }
}
