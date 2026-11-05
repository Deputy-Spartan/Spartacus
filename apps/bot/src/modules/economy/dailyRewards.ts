import { EmbedBuilder, type Client } from "discord.js";
import { CRATE_INFO, xpForLevel } from "@spartacus/shared";
import { prisma } from "../../lib/prisma";
import { claimDaily, getConfig } from "../../lib/economy";
import { economyPlus, giveCrates } from "../../lib/economyPlus";
import { awardAchievement, checkCustomAchievements } from "../../lib/achievements";

// /daily and the panel's Daily button: the coins, streak freezes saving a
// missed day, a Rare crate every 7 days in a row, and streak achievements.
export async function runDaily(client: Client, guildId: string, userId: string, channelId: string | null): Promise<{ content: string; ok: boolean }> {
  const config = await getConfig(guildId);
  const result = await claimDaily(guildId, userId);
  if (!result.ok) {
    if (result.reason === "disabled") return { ok: false, content: "The daily claim is turned off in this server." };
    const hours = Math.ceil(result.hoursRemaining ?? 0);
    return { ok: false, content: `You've already claimed today. Come back in about ${hours}h.` };
  }
  const extras: string[] = [];
  if (result.usedFreezes) extras.push(`🛡️ Used ${result.usedFreezes} streak freeze${result.usedFreezes === 1 ? "" : "s"} to save your streak.`);
  const plus = await economyPlus(guildId);
  if (plus.cratesEnabled && plus.crateOnStreak && result.streak > 0 && result.streak % 7 === 0) {
    await giveCrates(guildId, userId, "rare");
    extras.push(`${CRATE_INFO.rare.emoji} ${result.streak}-day streak: a **Rare Crate**! Open it with /crates.`);
  }
  if (result.streak >= 7) await awardAchievement(client, guildId, userId, "STREAK_7", "7-Day Streak", channelId ?? undefined);
  if (result.streak >= 30) await awardAchievement(client, guildId, userId, "STREAK_30", "30-Day Streak", channelId ?? undefined);
  await checkCustomAchievements(client, guildId, userId, "DAILY_STREAK", result.streak, channelId ?? undefined);
  return {
    ok: true,
    content: [`${config.currencyIcon} You claimed your daily **${result.amount.toLocaleString("en-US")} ${config.currencyName}**! 🔥 Streak: **${result.streak} day${result.streak === 1 ? "" : "s"}**`, ...extras].join("\n"),
  };
}

// The panel's Balance button.
export async function balanceEmbed(guildId: string, userId: string) {
  const [cfg, bal, inv, xp] = await Promise.all([
    getConfig(guildId),
    prisma.economyBalance.findUnique({ where: { guildId_userId: { guildId, userId } } }),
    prisma.economyInventory.findUnique({ where: { guildId_userId: { guildId, userId } } }),
    prisma.memberXp.findUnique({ where: { guildId_userId: { guildId, userId } } }),
  ]);
  const crates = (inv?.common ?? 0) + (inv?.rare ?? 0) + (inv?.epic ?? 0) + (inv?.legendary ?? 0);
  const boostOn = inv?.boostUntil && inv.boostUntil.getTime() > Date.now();
  const level = xp?.level ?? 0;
  return new EmbedBuilder()
    .setColor((cfg.embedColor as `#${string}`) || 0xe8c547)
    .setTitle("💰 Your wallet")
    .setDescription(
      [
        `${cfg.currencyIcon} **${(bal?.balance ?? 0).toLocaleString("en-US")} ${cfg.currencyName}**`,
        `🔥 Daily streak: **${bal?.dailyStreak ?? 0}** · 🛡️ Freezes: **${inv?.streakFreezes ?? 0}**`,
        `🎁 Crates: **${crates}**${boostOn ? ` · 🧪 ${inv?.boostMult}x XP until <t:${Math.floor((inv?.boostUntil as Date).getTime() / 1000)}:t>` : ""}`,
        `📈 Level **${level}** · ${(xp?.xp ?? 0).toLocaleString("en-US")} / ${xpForLevel(level + 1).toLocaleString("en-US")} XP`,
      ].join("\n")
    );
}
