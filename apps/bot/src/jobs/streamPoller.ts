import cron from "node-cron";
import { Client } from "discord.js";
import { logError } from "@spartacus/db";
import { pollStreams } from "../modules/community/goLive";

// Every 2 minutes: checks every followed streamer (Twitch in one batched
// call, the others a few at a time) and posts, updates or ends their alert.
// See modules/community/goLive.ts.
let running = false;
export function startStreamPollerJob(client: Client) {
  cron.schedule("*/2 * * * *", async () => {
    if (running) return;
    running = true;
    try {
      await pollStreams(client);
    } catch (err) {
      logError("bot", err);
    } finally {
      running = false;
    }
  });
}
