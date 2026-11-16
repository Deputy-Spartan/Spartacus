import cron from "node-cron";
import type { Client } from "discord.js";
import { logError } from "@spartacus/db";
import { isLeader } from "../lib/leader";
import { countdownTick, flushViewerCounts, refreshClipChannels, refreshLiveBoards, refreshLiveGuilds, votwTick } from "../modules/stream/growth";
import { pollFriends } from "../modules/stream/friends";
import { gameNightTick } from "../modules/stream/gameNight";
import { resubscribeAllKick } from "../modules/stream/accounts";
import { setDiscordClient } from "../modules/stream/discordRef";

// Stream Growth, in the background. Only the active copy of the bot runs these.
//   every minute       game night reminders and teams
//   odd minutes        countdowns, then friends' live checks, the live board
//                      and which servers are live (Going Live checks on even minutes)
//   every 5 minutes    Viewer of the Week counts and the weekly pick
//   once a day         Kick webhook subscriptions are renewed
function guarded(name: string, fn: () => Promise<unknown>) {
  let running = false;
  return async () => {
    if (running || !isLeader()) return;
    running = true;
    try {
      await fn();
    } catch (err) {
      console.error(`[streamGrowth] ${name} failed:`, err);
      logError("bot", err);
    } finally {
      running = false;
    }
  };
}

export function startStreamGrowthJobs(client: Client) {
  setDiscordClient(client);
  refreshClipChannels().catch(() => null);
  cron.schedule("* * * * *", guarded("game nights", () => gameNightTick(client)));
  cron.schedule(
    "1-59/2 * * * *",
    guarded("live", async () => {
      await countdownTick(client);
      await pollFriends(client);
      await refreshLiveBoards(client);
      await refreshLiveGuilds();
    }),
  );
  cron.schedule(
    "3-59/5 * * * *",
    guarded("viewers", async () => {
      await flushViewerCounts();
      await votwTick(client);
      await refreshClipChannels();
    }),
  );
  cron.schedule("17 4 * * *", guarded("kick", () => resubscribeAllKick()));
}
