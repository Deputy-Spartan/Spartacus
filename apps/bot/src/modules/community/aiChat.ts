import { Events, Message } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { isSendableChannel } from "../../lib/channels";
import { askClaude } from "../../lib/ai";

export const name = Events.MessageCreate;

const DEFAULT_SYSTEM_PROMPT =
  "You are Spartacus, a helpful Discord bot. Keep replies short and conversational — a sentence or two, not an essay.";

export async function execute(message: Message) {
  if (message.author.bot || !message.guildId || !message.client.user) return;
  if (!message.mentions.has(message.client.user)) return;

  const enabled = await isModuleEnabled(message.guildId, "AI_CHAT");
  if (!enabled) return;

  const config = await prisma.aiConfig.findUnique({ where: { guildId: message.guildId } });
  if (config?.chatChannelId && config.chatChannelId !== message.channelId) return;
  if (!isSendableChannel(message.channel)) return;

  const content = message.content.replace(/<@!?\d+>/g, "").trim();
  if (!content) return;

  await message.channel.sendTyping().catch(() => null);

  const reply = await askClaude(config?.chatSystemPrompt || DEFAULT_SYSTEM_PROMPT, content);

  if (reply) {
    await message.reply(reply.slice(0, 2000)).catch(() => null);
  } else {
    await message.reply("AI chat isn't configured on this bot yet — ask the owner to add an API key.").catch(() => null);
  }
}
