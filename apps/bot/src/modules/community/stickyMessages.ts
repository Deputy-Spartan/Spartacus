import { Events, Message } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { isSendableChannel } from "../../lib/channels";

export const name = Events.MessageCreate;

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

  if (sticky.lastMessageId) {
    const old = await message.channel.messages.fetch(sticky.lastMessageId).catch(() => null);
    await old?.delete().catch(() => null);
  }

  const posted = await message.channel.send(sticky.content).catch(() => null);
  if (posted) {
    await prisma.stickyMessage.update({ where: { id: sticky.id }, data: { lastMessageId: posted.id } });
  }
}
