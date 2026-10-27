import cron from "node-cron";
import { EmbedBuilder, Client } from "discord.js";
import { prisma } from "../lib/prisma";
import { logError } from "@spartacus/db";
import { isSendableChannel } from "../lib/channels";
import { isModuleEnabled } from "../lib/moduleGate";
import type { WeeklyRecapSettings } from "@prisma/client";

// Builds and sends one guild's recap — shared by the Monday cron below and
// the dashboard's "Send Test" button (see apps/api's weekly-recap-settings
// route), so a manual test produces the exact same embed a real Monday post
// would. Unlike the cron, a test send ignores whether there's anything to
// show (an empty recap still posts, clearly labeled) so clicking the button
// always gives visible feedback.
export async function postWeeklyRecap(client: Client, settings: WeeklyRecapSettings, options: { isTest?: boolean } = {}): Promise<{ ok: boolean; error?: string }> {
  if (!settings.channelId) return { ok: false, error: "Set a recap channel first." };

  const enabled = await isModuleEnabled(settings.guildId, "WEEKLY_RECAP");
  if (!enabled) return { ok: false, error: "Weekly Recap is disabled for this server." };

  const [levelingEnabled, economyEnabled] = await Promise.all([
    isModuleEnabled(settings.guildId, "LEVELING"),
    isModuleEnabled(settings.guildId, "ECONOMY"),
  ]);
  if (!levelingEnabled && !economyEnabled) {
    return { ok: false, error: "Turn on Leveling and/or Economy first — Weekly Recap has nothing to show without at least one." };
  }

  const sections: string[] = [];

  if (levelingEnabled) {
    const topXp = await prisma.memberXp.findMany({ where: { guildId: settings.guildId }, orderBy: { xp: "desc" }, take: 5 });
    if (topXp.length > 0) {
      const lines = topXp.map((row, i) => `${i + 1}. <@${row.userId}> (Level ${row.level})`);
      sections.push(`🏆 **Top Levels**\n${lines.join("\n")}`);
    }
  }

  if (economyEnabled) {
    const topBalances = await prisma.economyBalance.findMany({ where: { guildId: settings.guildId }, orderBy: { balance: "desc" }, take: 5 });
    if (topBalances.length > 0) {
      const lines = topBalances.map((row, i) => `${i + 1}. <@${row.userId}> (${row.balance} coins)`);
      sections.push(`💰 **Richest Members**\n${lines.join("\n")}`);
    }
  }

  if (sections.length === 0 && !options.isTest) return { ok: false, error: "Nothing to show yet this week." };

  const channel = await client.channels.fetch(settings.channelId).catch(() => null);
  if (!isSendableChannel(channel)) return { ok: false, error: "The configured channel isn't postable." };

  const guild = await client.guilds.fetch(settings.guildId).catch(() => null);

  const embed = new EmbedBuilder()
    .setColor("#57F287")
    .setTitle(`📊 Weekly Recap${guild ? ` — ${guild.name}` : ""}`)
    .setDescription(sections.length > 0 ? sections.join("\n\n") : "No standings to show yet — come back once there's some activity.")
    .setTimestamp();

  const sent = await channel
    .send({ content: options.isTest ? "🧪 **Test recap** — same embed Monday's real post would show." : undefined, embeds: [embed] })
    .catch((err) => {
      logError("bot", err, settings.guildId);
      return null;
    });

  return sent ? { ok: true } : { ok: false, error: "Failed to post — check the bot's permissions in that channel." };
}

// Runs Monday 13:00 UTC — one hour after the mod digest (0 12 * * MON) so
// the two weekly posts don't land in the same minute.
export function startWeeklyRecapJob(client: Client) {
  cron.schedule("0 13 * * MON", async () => {
    const settingsRows = await prisma.weeklyRecapSettings.findMany({ where: { channelId: { not: null } } });
    for (const settings of settingsRows) {
      await postWeeklyRecap(client, settings);
    }
  });
}
