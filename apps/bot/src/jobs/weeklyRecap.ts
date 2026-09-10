import cron from "node-cron";
import { EmbedBuilder, Client } from "discord.js";
import { prisma } from "../lib/prisma";
import { logError } from "@spartacus/db";
import { isSendableChannel } from "../lib/channels";
import { isModuleEnabled } from "../lib/moduleGate";

// Runs Monday 13:00 UTC — one hour after the mod digest (0 12 * * MON) so
// the two weekly posts don't land in the same minute.
export function startWeeklyRecapJob(client: Client) {
  cron.schedule("0 13 * * MON", async () => {
    let loggedThisTick = 0;
    const settingsRows = await prisma.weeklyRecapSettings.findMany({ where: { channelId: { not: null } } });
    if (settingsRows.length === 0) return;

    for (const settings of settingsRows) {
      const enabled = await isModuleEnabled(settings.guildId, "WEEKLY_RECAP");
      if (!enabled || !settings.channelId) continue;

      const [levelingEnabled, economyEnabled] = await Promise.all([
        isModuleEnabled(settings.guildId, "LEVELING"),
        isModuleEnabled(settings.guildId, "ECONOMY"),
      ]);
      if (!levelingEnabled && !economyEnabled) continue;

      const sections: string[] = [];

      if (levelingEnabled) {
        // NOTE: no weekly XP-gain snapshot exists in the schema (MemberXp
        // only stores a running total), so this shows current all-time
        // leaderboard standing rather than a true "gained this week" delta.
        const topXp = await prisma.memberXp.findMany({
          where: { guildId: settings.guildId },
          orderBy: { xp: "desc" },
          take: 5,
        });
        if (topXp.length > 0) {
          const lines = topXp.map((row, i) => `${i + 1}. <@${row.userId}> (Level ${row.level})`);
          sections.push(`🏆 **Top Levels**\n${lines.join("\n")}`);
        }
      }

      if (economyEnabled) {
        // Same caveat as above: EconomyBalance holds a running total, not a
        // weekly delta, so this is current all-time standing.
        const topBalances = await prisma.economyBalance.findMany({
          where: { guildId: settings.guildId },
          orderBy: { balance: "desc" },
          take: 5,
        });
        if (topBalances.length > 0) {
          const lines = topBalances.map((row, i) => `${i + 1}. <@${row.userId}> (${row.balance} coins)`);
          sections.push(`💰 **Richest Members**\n${lines.join("\n")}`);
        }
      }

      if (sections.length === 0) continue;

      const channel = await client.channels.fetch(settings.channelId).catch(() => null);
      if (!isSendableChannel(channel)) continue;

      const guild = await client.guilds.fetch(settings.guildId).catch(() => null);

      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle(`📊 Weekly Recap${guild ? ` — ${guild.name}` : ""}`)
        .setDescription(sections.join("\n\n"))
        .setTimestamp();

      await channel.send({ embeds: [embed] }).catch((err) => {
        if (loggedThisTick < 5) { logError("bot", err, settings.guildId); loggedThisTick++; }
        return null;
      });
    }
  });
}
