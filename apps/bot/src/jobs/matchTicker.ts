import cron from "node-cron";
import { Client } from "discord.js";
import { logError } from "@spartacus/db";
import { tickMatches } from "../modules/matches/flow";

// Posts new panels and runs out timers (check-in, votes, bans, confirmations).
// Deadlines live in the database, so they still fire after a restart.
export function startMatchTickerJob(client: Client) {
  cron.schedule("*/5 * * * * *", () => {
    tickMatches(client).catch((err) => logError("bot", err));
  });
}
