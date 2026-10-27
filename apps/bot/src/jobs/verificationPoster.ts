import cron from "node-cron";
import { Client } from "discord.js";
import { prisma } from "../lib/prisma";
import { postVerificationPanel } from "../modules/security/verification";

// Catch-up sweep every minute — covers the bot being offline when the
// dashboard's immediate post (see apps/api's verification-settings route)
// fired, or any row left pending for another reason. Mirrors
// apps/bot/src/jobs/rulesGatePoster.ts.
export function startVerificationPosterJob(client: Client) {
  cron.schedule("* * * * *", async () => {
    const pending = await prisma.verificationConfig.findMany({ where: { panelChannelId: { not: null }, panelMessageId: null }, take: 20 });
    for (const config of pending) {
      await postVerificationPanel(client, config);
    }
  });
}
