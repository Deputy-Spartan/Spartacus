import cron from "node-cron";
import { Client } from "discord.js";
import { logError } from "@spartacus/db";
import { tickPlayingNow } from "../modules/engagement/playingNow";

// Ends Playing Now posts when their time is up or the player left voice,
// tidies old posts away, and posts panels that are set up but not posted.
export function startPlayingNowJob(client: Client) {
  // Returned so a tick that is still running isn't joined by the next one.
  cron.schedule("*/30 * * * * *", () => tickPlayingNow(client).catch((err) => logError("bot", err)));
}
