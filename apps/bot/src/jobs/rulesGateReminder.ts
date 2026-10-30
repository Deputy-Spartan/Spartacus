import cron from "node-cron";
import { Client } from "discord.js";
import { prisma } from "../lib/prisma";
import { isModuleEnabled } from "../lib/moduleGate";

const DEFAULT_REMINDER =
  '👋 Just a reminder — you still need to agree to the rules in **{server}** to get full access. Head back to the server and click "I Agree".';

// Nudges members who joined but haven't agreed yet. By default sends one
// DM after reminderDelayHours. With reminderRepeatEnabled, keeps sending
// again every week on the chosen weekday/hour (UTC) until they agree.
// Keyed off RulesGatePendingMember rows created in guildMemberAdd.onMemberJoin
// and deleted the moment they agree (modules/community/rulesGate.ts).
export function startRulesGateReminderJob(client: Client) {
  cron.schedule("*/15 * * * *", async () => {
    const pending = await prisma.rulesGatePendingMember.findMany({ take: 200 });
    const now = new Date();

    for (const row of pending) {
      const settings = await prisma.rulesGateSettings.findUnique({ where: { guildId: row.guildId } });
      if (!settings?.reminderEnabled) continue;

      const enabled = await isModuleEnabled(row.guildId, "RULES_GATE");
      if (!enabled) continue;

      let shouldSend = false;
      if (!row.remindedAt) {
        const elapsedHours = (now.getTime() - row.joinedAt.getTime()) / 3_600_000;
        shouldSend = elapsedHours >= settings.reminderDelayHours;
      } else if (settings.reminderRepeatEnabled && settings.reminderRepeatWeekday != null && settings.reminderRepeatHour != null) {
        // Guard against resending within the same hour window (cron runs
        // every 15 min) by requiring at least 20h since the last send.
        const hoursSinceLast = (now.getTime() - row.remindedAt.getTime()) / 3_600_000;
        shouldSend = hoursSinceLast >= 20 && now.getUTCDay() === settings.reminderRepeatWeekday && now.getUTCHours() === settings.reminderRepeatHour;
      }
      if (!shouldSend) continue;

      const guild = await client.guilds.fetch(row.guildId).catch(() => null);
      if (!guild) {
        await prisma.rulesGatePendingMember.update({ where: { id: row.id }, data: { remindedAt: now } }).catch(() => null);
        continue;
      }

      const member = await guild.members.fetch(row.userId).catch(() => null);
      if (member && !(settings.roleId && member.roles.cache.has(settings.roleId))) {
        const message = (settings.reminderMessage || DEFAULT_REMINDER).replace(/\{server\}/g, guild.name);
        await member.send(message).catch(() => null);
      }

      await prisma.rulesGatePendingMember.update({ where: { id: row.id }, data: { remindedAt: now } }).catch(() => null);
    }
  });
}
