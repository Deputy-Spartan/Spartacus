import { Events, Message } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { isSendableChannel } from "../../lib/channels";
import { askClaudeTurns, type AiFailure, type AiTurn } from "../../lib/ai";
import { claimEvent } from "../../lib/eventClaims";

export const name = Events.MessageCreate;

const DEFAULT_SYSTEM_PROMPT =
  "You are Spartacus, a helpful Discord bot. Keep replies short and conversational — a sentence or two, not an essay.";

// Added to every personality so the model knows how the conversation reaches it.
const CHAT_RULES =
  "\n\nYou're chatting in a Discord channel. Each user message starts with the speaker's name, and several people may talk to you. Reply as plain Discord text (no name prefix), under 1,500 characters.";

// ---- Short memory: the last few messages with the bot, per channel ----
const MEMORY_TURNS = 10; // 5 questions and 5 answers
const MEMORY_IDLE_MS = 15 * 60_000; // forget after 15 quiet minutes
const memory = new Map<string, { at: number; turns: AiTurn[] }>();

function recall(channelId: string): AiTurn[] {
  const m = memory.get(channelId);
  if (!m || Date.now() - m.at > MEMORY_IDLE_MS) {
    memory.delete(channelId);
    return [];
  }
  return m.turns;
}

function remember(channelId: string, question: AiTurn, answer: string) {
  let turns = [...recall(channelId), question, { role: "assistant", content: answer } as AiTurn].slice(-MEMORY_TURNS);
  while (turns.length && turns[0].role !== "user") turns = turns.slice(1); // must start with a question
  memory.set(channelId, { at: Date.now(), turns });
  if (memory.size > 500) {
    const oldest = [...memory.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) memory.delete(oldest[0]);
  }
}

export function forgetChannel(channelId: string) {
  memory.delete(channelId);
}

// ---- Cooldown: each person can ask a few questions a minute ----
const PER_MINUTE = 5;
const asked = new Map<string, number[]>();
const warned = new Map<string, number>();

function tooFast(key: string): number {
  const now = Date.now();
  const recent = (asked.get(key) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= PER_MINUTE) {
    asked.set(key, recent);
    return Math.ceil((60_000 - (now - recent[0])) / 1000);
  }
  recent.push(now);
  asked.set(key, recent);
  return 0;
}

const FAILURE_TEXT: Record<AiFailure, string> = {
  no_key: "AI chat isn't set up yet: the bot owner needs to add an Anthropic API key in Render.",
  bad_key: "AI chat's API key was rejected. The bot owner should check the key in Render.",
  no_credit: "AI chat is out of credit. The bot owner can add more at platform.claude.com.",
  busy: "The AI is busy right now. Try again in a moment.",
  refused: "I can't help with that one.",
  error: "Something went wrong answering that. Try again in a moment.",
};

export async function execute(message: Message) {
  if (message.author.bot || !message.guildId || !message.client.user) return;
  if (!message.mentions.has(message.client.user, { ignoreEveryone: true, ignoreRoles: true })) return;

  const enabled = await isModuleEnabled(message.guildId, "AI_CHAT");
  if (!enabled) return;

  const config = await prisma.aiConfig.findUnique({ where: { guildId: message.guildId } });
  if (config?.chatChannelId && config.chatChannelId !== message.channelId) return;
  if (!isSendableChannel(message.channel)) return;

  const content = message.content.replace(/<@!?\d+>/g, "").trim();
  if (!content) return;

  // Belt and braces with the one-active-copy switch: one answer per message.
  if (!(await claimEvent(`aichat:${message.id}`))) return;

  const wait = tooFast(`${message.guildId}:${message.author.id}`);
  if (wait) {
    const key = `${message.guildId}:${message.author.id}`;
    if (Date.now() - (warned.get(key) ?? 0) > 30_000) {
      warned.set(key, Date.now());
      const note = await message.reply({ content: `Slow down a little, try again in ${wait}s.`, allowedMentions: { repliedUser: false } }).catch(() => null);
      if (note) setTimeout(() => void note.delete().catch(() => null), 8_000);
    }
    return;
  }

  await message.channel.sendTyping().catch(() => null);

  const speaker = message.member?.displayName ?? message.author.displayName ?? message.author.username;
  const question: AiTurn = { role: "user", content: `${speaker}: ${content.slice(0, 1500)}` };
  const system = (config?.chatSystemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT) + CHAT_RULES;

  const result = await askClaudeTurns(system, [...recall(message.channelId), question]);

  if (result.ok) {
    remember(message.channelId, question, result.text);
    await message.reply({ content: result.text.slice(0, 2000), allowedMentions: { repliedUser: true, users: [], roles: [], parse: [] } }).catch(() => null);
  } else {
    await message.reply({ content: FAILURE_TEXT[result.reason], allowedMentions: { repliedUser: false } }).catch(() => null);
  }
}
