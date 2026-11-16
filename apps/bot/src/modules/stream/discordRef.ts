import type { Client } from "discord.js";

// The bot's Discord client, for code that runs from the API side (webhooks)
// and has no interaction or job to get it from.
let current: Client | null = null;
export const setDiscordClient = (c: Client) => {
  current = c;
};
export const getDiscordClient = () => current;
