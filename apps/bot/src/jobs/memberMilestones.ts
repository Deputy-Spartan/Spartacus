import cron from "node-cron";
import { Client } from "discord.js";
import { prisma } from "../lib/prisma";
import { logError } from "@spartacus/db";
import { isSendableChannel } from "../lib/channels";
import { isModuleEnabled } from "../lib/moduleGate";

// Returns the number of full years between `joinedAt` and `today` if today is
// exactly an N-year anniversary (N >= 1) of the join date (month+day match),
// otherwise null. A member who joined today THIS year is 0 years out and
// deliberately does not count as a milestone. Feb 29 joiners are treated as
// anniversary-eligible only on years that actually have a Feb 29 (comparing
// month+day directly against `today` naturally skips them on non-leap years,
// since `today` can never read as "2/29" then).
export function getAnniversaryYears(joinedAt: Date, today: Date): number | null {
  const years = today.getFullYear() - joinedAt.getFullYear();
  if (years < 1) return null;
  if (today.getMonth() !== joinedAt.getMonth() || today.getDate() !== joinedAt.getDate()) return null;
  return years;
}

// Runs once daily at noon UTC — for each guild with the module enabled and a
// configured channel, finds members whose join-date anniversary (1 year,
// 2 years, etc.) falls today and posts ONE combined celebration message
// per guild (never one message per member, to avoid spam).
//
// Known limitation: `guild.members.fetch()` pulls the entire member list
// into memory for every enabled guild, once a day. That's fine at the scale
// this bot currently runs at, but would need pagination/rate-limit handling
// (or a persisted per-member join date, avoiding the fetch entirely) if a
// guild gets large enough for this to become slow or hit rate limits.
export function startMemberMilestonesJob(client: Client) {
  cron.schedule("0 12 * * *", async () => {
    const guildIds = client.guilds.cache.map((g) => g.id);
    const today = new Date();

    for (const guildId of guildIds) {
      try {
        const enabled = await isModuleEnabled(guildId, "MEMBER_MILESTONES");
        if (!enabled) continue;

        const settings = await prisma.milestoneSettings.findUnique({ where: { guildId } });
        if (!settings?.channelId) continue;

        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) continue;

        const channel = await client.channels.fetch(settings.channelId).catch(() => null);
        if (!isSendableChannel(channel)) continue;

        const members = await guild.members.fetch().catch(() => null);
        if (!members) continue;

        const celebrating: string[] = [];
        for (const member of members.values()) {
          if (!member.joinedAt) continue;
          const years = getAnniversaryYears(member.joinedAt, today);
          if (years === null) continue;
          celebrating.push(`<@${member.id}> (${years} year${years === 1 ? "" : "s"})`);
        }

        if (celebrating.length === 0) continue;

        await channel.send({
          content: `🎉 Celebrating server anniversaries today: ${celebrating.join(", ")}`,
        });
      } catch (err) {
        logError("bot", err, guildId);
      }
    }
  });
}
