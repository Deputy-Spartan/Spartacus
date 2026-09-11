import { REST, Routes } from "discord.js";
import { commands } from "../commands";

// Shared by both the manual `npm run deploy-commands` CLI script and the
// bot's own boot sequence (see index.ts's "ready" handler) — the render.yaml
// deploy pipeline never ran deploy-commands automatically, which meant every
// new/changed slash command silently failed to reach Discord until someone
// remembered to run it by hand. Running this on every boot instead makes
// registration a byproduct of deploying, not a separate manual step.
// DISCORD_DEV_GUILD_ID (set only in local dev) registers instantly to one
// guild instead of the ~1hr propagation global commands take.
export async function registerCommands(): Promise<{ count: number; scope: string }> {
  const body = [...commands.values()].map((c) => c.data.toJSON());
  const rest = new REST().setToken(process.env.DISCORD_TOKEN as string);
  const guildId = process.env.DISCORD_DEV_GUILD_ID;

  const route = guildId
    ? Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID as string, guildId)
    : Routes.applicationCommands(process.env.DISCORD_CLIENT_ID as string);

  await rest.put(route, { body });
  return { count: body.length, scope: guildId ? `guild ${guildId}` : "globally" };
}
