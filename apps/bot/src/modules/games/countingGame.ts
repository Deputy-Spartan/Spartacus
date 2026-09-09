import { Message } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isSendableChannel } from "../../lib/channels";

// Shown on every wrong entry regardless of whether the count resets — the
// reset message (if any) follows right after as a separate, more serious line.
const WRONG_MESSAGES = [
  "❌ Nope, that's not it. Math is hard, I get it.",
  "❌ Close, but no. Try counting on your actual fingers this time.",
  "❌ Wrong! Somewhere, a mathematician just felt a disturbance.",
  "❌ That number owes this channel an apology.",
  "❌ Big oof. That was not the number we were looking for.",
  "❌ Incorrect. The count has left the chat in disappointment.",
  "❌ Swing and a miss! Try again, champ.",
  "❌ That's a bold guess. A wrong one, but a bold one.",
];

function randomWrongMessage() {
  return WRONG_MESSAGES[Math.floor(Math.random() * WRONG_MESSAGES.length)];
}

export async function checkCountingMessage(message: Message) {
  if (!message.guildId) return;

  const config = await prisma.countingGameConfig.findUnique({ where: { guildId: message.guildId } });
  if (!config?.channelId || message.channelId !== config.channelId) return;

  const submitted = Number(message.content.trim());
  const expected = config.currentCount + 1;
  const isRightNumber = Number.isInteger(submitted) && submitted === expected;
  const isSameUserTwice = isRightNumber && message.author.id === config.lastUserId;
  const isValid = isRightNumber && !isSameUserTwice;

  if (isValid) {
    const highScore = Math.max(config.highScore, submitted);
    await prisma.countingGameConfig.update({
      where: { guildId: message.guildId },
      data: { currentCount: submitted, lastUserId: message.author.id, highScore },
    });
    await message.react("✅").catch((err) => console.error("[counting-game] failed to react ✅ — check bot has Add Reactions permission:", err.message));
    return;
  }

  // Right number but same user posted the last one too — don't reset the
  // count for this, just ask for someone else to take the next number.
  if (isSameUserTwice) {
    if (isSendableChannel(message.channel)) {
      await message
        .reply(`⏳ Someone else has to count **${expected}** — you already took the last number.`)
        .catch((err) => console.error("[counting-game] failed to send same-user message:", err.message));
    }
    return;
  }

  // Wrong number or out-of-order sequence.
  if (isSendableChannel(message.channel)) {
    await message.reply(randomWrongMessage()).catch((err) => console.error("[counting-game] failed to send wrong-answer message:", err.message));
  }

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
