import cron from "node-cron";
import { Client, EmbedBuilder } from "discord.js";
import { prisma } from "../lib/prisma";
import { logError } from "@spartacus/db";
import { isModuleEnabled } from "../lib/moduleGate";
import { isSendableChannel } from "../lib/channels";

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}m`].filter(Boolean);
  return parts.length ? parts.join(" ") : "<1m";
}

// Keeps a single embed message per configured channel up to date with a
// live online indicator. This job only runs while the bot's gateway
// connection is alive, so the embed simply stops refreshing (rather than
// flipping to "offline") if the process goes down — Discord doesn't let a
// dead process edit a message to say so. The dashboard's own status badge
// (apps/web) is the accurate real-time signal; this channel is a
// best-effort mirror of it for members who only see Discord.
export function startStatusChannelPosterJob(client: Client) {
  cron.schedule("* * * * *", async () => {
    // An owner-set OFFLINE/MAINTENANCE override means someone deliberately
    // wants the channel to say that, even though the bot is clearly alive
    // (it's the one running this very job) — skip so this doesn't fight the
    // API-side watchdog that owns painting the override onto the embed.
    // A null override or an explicit ONLINE override both fall through to
    // normal behavior below.
    const config = await prisma.botConfig.findUnique({ where: { id: "singleton" } });
    if (config?.manualStatusOverride === "OFFLINE" || config?.manualStatusOverride === "MAINTENANCE") return;
    // Same while a dashboard deploy is in progress — the API watchdog has
    // painted "Updating" and paints "Online" again once Vercel finishes.
    // Mirrors isDashboardDeploying's 30-minute staleness cutoff in
    // apps/api/src/lib/botStatus.ts.
    if (!config?.manualStatusOverride && config?.dashboardDeployingSince && Date.now() - config.dashboardDeployingSince.getTime() < 30 * 60_000) return;

    let loggedThisTick = 0;
    const rows = await prisma.statusChannel.findMany({ take: 200 });

    for (const row of rows) {
      const enabled = await isModuleEnabled(row.guildId, "STATUS_CHANNEL");
      if (!enabled) continue;

      const channel = await client.channels.fetch(row.channelId).catch(() => null);
      if (!isSendableChannel(channel)) continue;

      const embed = new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle("🟢 Spartacus is Online")
        .setDescription(`Uptime: ${formatUptime(process.uptime())}`)
        .setFooter({ text: "Last updated" })
        .setTimestamp(new Date());

      const existing = row.messageId ? await channel.messages.fetch(row.messageId).catch(() => null) : null;

      if (existing) {
        await existing.edit({ embeds: [embed] }).catch((err) => {
          if (loggedThisTick < 5) { logError("bot", err, row.guildId); loggedThisTick++; }
          return null;
        });
      } else {
        const message = await channel.send({ embeds: [embed] }).catch((err) => {
          if (loggedThisTick < 5) { logError("bot", err, row.guildId); loggedThisTick++; }
          return null;
        });
        if (message) await prisma.statusChannel.update({ where: { id: row.id }, data: { messageId: message.id } });
      }
    }
  });
}
