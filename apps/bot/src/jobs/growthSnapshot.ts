import cron from "node-cron";
import { Client } from "discord.js";
import { prisma } from "../lib/prisma";
import { logError } from "@spartacus/db";
import { isModuleEnabled } from "../lib/moduleGate";

// Once daily at midnight UTC: snapshot each enabled guild's member count and
// the message count that accumulated over the day that just ended (yesterday's
// DailyMessageCount row), so the dashboard can chart growth over time.
export function startGrowthSnapshotJob(client: Client) {
  cron.schedule("0 0 * * *", async () => {
    const guildIds = client.guilds.cache.map((g) => g.id);

    const yesterday = new Date();
    yesterday.setUTCHours(0, 0, 0, 0);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    for (const guildId of guildIds) {
      try {
        const enabled = await isModuleEnabled(guildId, "GROWTH_ANALYTICS");
        if (!enabled) continue;

        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) continue;

        const dailyCount = await prisma.dailyMessageCount.findUnique({
          where: { guildId_date: { guildId, date: yesterday } },
        });

        await prisma.growthSnapshot.create({
          data: {
            guildId,
            memberCount: guild.memberCount,
            messageCount: dailyCount?.count ?? 0,
          },
        });
      } catch (err) {
        logError("bot", err, guildId);
      }
    }
  });
}
