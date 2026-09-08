import { REST, Routes } from "discord.js";
import { commands } from "./commands";

const body = [...commands.values()].map((c) => c.data.toJSON());

const rest = new REST().setToken(process.env.DISCORD_TOKEN as string);

async function main() {
  const guildId = process.env.DISCORD_DEV_GUILD_ID; // set for instant per-guild deploys in dev

  const route = guildId
    ? Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID as string, guildId)
    : Routes.applicationCommands(process.env.DISCORD_CLIENT_ID as string);

  await rest.put(route, { body });
  console.log(`[deploy] Registered ${body.length} slash command(s)${guildId ? ` to guild ${guildId}` : " globally"}.`);
}

main().catch(console.error);
