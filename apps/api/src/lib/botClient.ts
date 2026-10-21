import type { Client } from "discord.js";

// Set once in apps/api/src/index.ts right after the bot starts (only when
// RUN_BOT_INLINE=true, the default merged-process deployment). Routes that
// need to act through the bot's live gateway connection — like sticky
// message resend — read it from here instead of making their own separate
// Discord REST calls, which would bypass the bot's own in-memory guards.
let botClient: Client | null = null;

export function setBotClient(client: Client) {
  botClient = client;
}

export function getBotClient(): Client | null {
  return botClient;
}
