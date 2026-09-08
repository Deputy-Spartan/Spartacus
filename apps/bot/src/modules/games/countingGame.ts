import { Message } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isSendableChannel } from "../../lib/channels";

export async function checkCountingMessage(message: Message) {
  if (!message.guildId) return;

  const config = await prisma.countingGameConfig.findUnique({ where: { guildId: message.guildId } });
  if (!config?.channelId || message.channelId !== config.channelId) return;

  const submitted = Number(message.content.trim());
  const expected = config.currentCount + 1;
  const isValid = Number.isInteger(submitted) && submitted === expected && message.author.id !== config.lastUserId;

  if (isValid) {
    const highScore = Math.max(config.highScore, submitted);
    await prisma.countingGameConfig.update({
      where: { guildId: message.guildId },
      data: { currentCount: submitted, lastUserId: message.author.id, highScore },
    });
    await message.react("✅").catch(() => null);
    return;
  }

  // Wrong number, out-of-order sequence, or same user counting twice in a row.
  await message.react("❌").catch(() => null);
  if (config.resetOnMistake) {
    await prisma.countingGameConfig.update({
      where: { guildId: message.guildId },
      data: { currentCount: 0, lastUserId: null },
    });
    if (isSendableChannel(message.channel)) {
      await message.channel.send(`💥 Count broken by ${message.author}! Starting back over from **1**.`).catch(() => null);
    }
  }
}
