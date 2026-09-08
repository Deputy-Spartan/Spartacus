import { Events, Message } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { logCase } from "../../lib/cases";

export const name = Events.MessageCreate;

export async function execute(message: Message) {
  if (message.author.bot || !message.guildId) return;
  const enabled = await isModuleEnabled(message.guildId, "HONEYPOT");
  if (!enabled) return;

  const config = await prisma.honeypotConfig.findUnique({ where: { guildId: message.guildId } });
  if (!config?.channelId || message.channelId !== config.channelId) return;

  const member = await message.guild?.members.fetch(message.author.id).catch(() => null);
  await member?.ban({ reason: "Honeypot channel triggered" }).catch(() => null);

  await logCase({
    guildId: message.guildId,
    userId: message.author.id,
    action: "BAN",
    reason: "Honeypot channel triggered",
    moderatorId: message.client.user?.id ?? "system",
  });
}
