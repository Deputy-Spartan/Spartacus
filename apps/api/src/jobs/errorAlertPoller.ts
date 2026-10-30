import { prisma } from "@spartacus/db";
import { postChannelMessage } from "../lib/discordRest";

const POLL_INTERVAL_MS = 20_000;

// A failing job (e.g. a panel that Discord keeps rejecting) logs the same
// error on every retry — without this, each retry would post and ping
// again. The first occurrence alerts; identical ones for the same guild
// are muted until this window passes since the last alert.
const REPEAT_MUTE_MS = 60 * 60 * 1000;

// Guild-scoped errors only — account-wide errors (guildId null, e.g. an
// auth failure with no guild context) have nowhere sensible to post since
// this is a per-server channel setting, so they stay dashboard-only.
export function startErrorAlertPoller() {
  let lastCheckedAt = new Date();
  const lastAlertedAt = new Map<string, number>(); // `${guildId}:${message}` → ms

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

    const now = Date.now();
    for (const [key, at] of lastAlertedAt) {
      if (now - at > REPEAT_MUTE_MS) lastAlertedAt.delete(key);
    }
    if (newErrors.length === 0) return;

    const guildIds = [...new Set(newErrors.map((e) => e.guildId as string))];
    const settings = await prisma.alertSettings.findMany({
      where: { guildId: { in: guildIds }, errorChannelId: { not: null } },
    });
    const settingsByGuild = new Map(settings.map((s) => [s.guildId, s]));
    const dashboardUrl = process.env.NEXTAUTH_URL;

    for (const err of newErrors) {
      const s = settingsByGuild.get(err.guildId as string);
      if (!s?.errorChannelId) continue;

      const repeatKey = `${err.guildId}:${err.message}`;
      if (lastAlertedAt.has(repeatKey)) continue;
      lastAlertedAt.set(repeatKey, now);

      const mentions = [s.errorPingRoleId && `<@&${s.errorPingRoleId}>`, s.errorPingUserId && `<@${s.errorPingUserId}>`].filter(Boolean);
      const stackPreview = err.stack?.split("\n").slice(1, 6).join("\n");
      const errorsLink = dashboardUrl ? `[Open the Errors page](${dashboardUrl}/dashboard/${err.guildId}/errors)` : null;

      await postChannelMessage(s.errorChannelId, {
        content: mentions.length ? mentions.join(" ") : undefined,
        allowed_mentions: {
          roles: s.errorPingRoleId ? [s.errorPingRoleId] : [],
          users: s.errorPingUserId ? [s.errorPingUserId] : [],
        },
        embeds: [
          {
            color: 0xef4444,
            title: `⚠️ ${err.source === "bot" ? "Bot" : "Dashboard"} Error`,
            description: [
              err.message.slice(0, 3000),
              stackPreview && `\n**Where it happened**\n\`\`\`\n${stackPreview.slice(0, 700)}\n\`\`\``,
              errorsLink,
            ]
              .filter(Boolean)
              .join("\n"),
            footer: { text: "Repeats of this same error are muted for 1 hour." },
            timestamp: err.createdAt.toISOString(),
          },
        ],
      }).catch(() => null);
    }
  }, POLL_INTERVAL_MS);
}
