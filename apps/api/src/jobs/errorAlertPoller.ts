import { prisma } from "@spartacus/db";
import { postChannelMessage } from "../lib/discordRest";

const POLL_INTERVAL_MS = 20_000;

// Guild-scoped errors only — account-wide errors (guildId null, e.g. an
// auth failure with no guild context) have nowhere sensible to post since
// this is a per-server channel setting, so they stay dashboard-only.
export function startErrorAlertPoller() {
  let lastCheckedAt = new Date();

  setInterval(async () => {
    const checkStartedAt = new Date();
    const newErrors = await prisma.errorLog
      .findMany({
        where: { createdAt: { gt: lastCheckedAt }, guildId: { not: null } },
        orderBy: { createdAt: "asc" },
        take: 50,
      })
      .catch(() => []);
    lastCheckedAt = checkStartedAt;
    if (newErrors.length === 0) return;

    const guildIds = [...new Set(newErrors.map((e) => e.guildId as string))];
    const settings = await prisma.alertSettings.findMany({
      where: { guildId: { in: guildIds }, errorChannelId: { not: null } },
    });
    const channelByGuild = new Map(settings.map((s) => [s.guildId, s.errorChannelId as string]));

    for (const err of newErrors) {
      const channelId = channelByGuild.get(err.guildId as string);
      if (!channelId) continue;

      await postChannelMessage(channelId, {
        embeds: [
          {
            color: 0xef4444,
            title: `⚠️ ${err.source === "bot" ? "Bot" : "Dashboard"} Error`,
            description: err.message.slice(0, 4000),
            timestamp: err.createdAt.toISOString(),
          },
        ],
      }).catch(() => null);
    }
  }, POLL_INTERVAL_MS);
}
