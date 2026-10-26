import { Events, Message } from "discord.js";
import { prisma } from "../../lib/prisma";

export const name = Events.MessageCreate;

// Collects the free-text reply once a member has clicked a poll's ✍️
// write-in reaction (see modules/engagement/pollVotes.ts, which creates the
// pending row and sends the prompt). Any other DM-driven flow (Modmail,
// Applications, Support DM) checks its own pending state the same way, so
// this just adds one more link in that chain.
export async function execute(message: Message) {
  if (message.author.bot || message.guild) return;

  const pending = await prisma.pollWriteInPending.findUnique({ where: { userId: message.author.id } });
  if (!pending) return;

  const text = message.content.trim();
  if (!text) {
    await message.reply("That answer's empty — reply with some text, or react ✍️ again later if you've changed your mind.").catch(() => null);
    return;
  }

  const poll = await prisma.poll.findUnique({ where: { id: pending.pollId } });
  await prisma.pollWriteInPending.delete({ where: { userId: message.author.id } }).catch(() => null);

  if (!poll || poll.closed) {
    await message.reply("That poll isn't accepting answers anymore — sorry!").catch(() => null);
    return;
  }

  await prisma.pollWriteIn.create({ data: { pollId: poll.id, userId: message.author.id, text: text.slice(0, 1000) } });
  await message.reply(`✅ Got it — your answer for **${poll.question}** has been recorded.`).catch(() => null);
}
