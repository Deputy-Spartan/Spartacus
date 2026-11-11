import cron from "node-cron";
import type { Client } from "discord.js";
import { logError } from "@spartacus/db";
import { pollClips, postClipOfTheWeek } from "../modules/stream/clips";
import { scheduleTick } from "../modules/stream/schedule";
import { rewardTick } from "../modules/stream/rewards";
import { startTwitchChat } from "../modules/stream/twitchChat";

// Stream Extras, in the background: new clips (every 5 minutes, plus the weekly
// pick), the schedule message and its Discord events (every 10 minutes), and
// viewer rewards from Twitch chat (every 5 minutes). Each only does work for
// servers that turned the matching part on.
function guarded(name: string, fn: () => Promise<void>) {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try {
      await fn();
    } catch (err) {
      console.error(`[streamExtras] ${name} failed:`, err);
      logError("bot", err);
    } finally {
      running = false;
    }
  };
}

export function startStreamExtrasJobs(client: Client) {
  startTwitchChat(client);
  cron.schedule("2-59/5 * * * *", guarded("clips", async () => {
    await pollClips(client);
    await postClipOfTheWeek(client);
  }));
  cron.schedule("4-59/10 * * * *", guarded("schedule", () => scheduleTick(client)));
  cron.schedule("*/5 * * * *", guarded("rewards", () => rewardTick(client)));
}
