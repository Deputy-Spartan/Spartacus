import { Events, Message } from "discord.js";
import { isModuleEnabled } from "../../lib/moduleGate";
import { askClaude } from "../../lib/ai";
import { handleViolation } from "./automod";

export const name = Events.MessageCreate;

const CLASSIFY_PROMPT =
  "You moderate a Discord server. Reply with exactly one word: VIOLATION if the message contains harassment, hate speech, explicit sexual content, or serious threats — otherwise reply OK. No explanation.";

// Deliberately separate from the regex-based automod checks in
// automod.ts — this is opt-in (the AI_MODERATION module toggle, since it
// costs an API call per message) and only catches what pattern matching
// can't: actual meaning, not just banned words/links.
export async function execute(message: Message) {
  if (message.author.bot || !message.guildId) return;
  if (!message.content.trim()) return;

  const enabled = await isModuleEnabled(message.guildId, "AI_MODERATION");
  if (!enabled) return;

  const verdict = await askClaude(CLASSIFY_PROMPT, message.content, 10);
  if (verdict?.trim().toUpperCase().startsWith("VIOLATION")) {
    await handleViolation(message, "AI-flagged content");
  }
}
