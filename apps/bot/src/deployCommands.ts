import { registerCommands } from "./lib/registerCommands";

async function main() {
  const { count, scope } = await registerCommands();
  console.log(`[deploy] Registered ${count} slash command(s) ${scope}.`);
}

main().catch(console.error);
