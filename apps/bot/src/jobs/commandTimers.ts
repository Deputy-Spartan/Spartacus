import cron from "node-cron";
import { Client } from "discord.js";
import { logError } from "@spartacus/db";
import { tickCommandTimers } from "../modules/community/customSlashCommands";

// Runs the "later" parts of custom commands: temporary bans and roles
// ending, and messages sent after a delay. Stored in the database, so they
// still happen after a restart.
export function startCommandTimersJob(client: Client) {
  cron.schedule("* * * * *", () => {
    tickCommandTimers(client).catch((err) => logError("bot", err));
  });
}
