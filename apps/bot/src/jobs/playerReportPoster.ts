import cron from "node-cron";
import { Client } from "discord.js";
import { prisma } from "../lib/prisma";
import { postPlayerReportPanel } from "../modules/moderation/playerReports";

// Catch-up sweep every minute — covers the bot being offline when the
// dashboard's immediate post (apps/api's report-settings route) fired, or
// any row left pending for another reason. Mirrors jobs/verificationPoster.ts.
export function startPlayerReportPosterJob(client: Client) {
  cron.schedule("* * * * *", async () => {
    const pending = await prisma.playerReportSettings.findMany({ where: { panelChannelId: { not: null }, panelMessageId: null }, take: 20 });
    for (const settings of pending) {
      await postPlayerReportPanel(client, settings);
    }
  });
}
