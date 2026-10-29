import cron from "node-cron";
import { Client } from "discord.js";
import { prisma } from "../lib/prisma";
import { isModuleEnabled } from "../lib/moduleGate";

const DEFAULT_REMINDER =
  '👋 Just a reminder — you still need to agree to the rules in **{server}** to get full access. Head back to the server and click "I Agree".';

// Nudges members who joined but haven't agreed yet, one time each. Keyed off
// RulesGatePendingMember rows created in guildMemberAdd.onMemberJoin and
// deleted the moment they agree (modules/community/rulesGate.ts).
export function startRulesGateReminderJob(client: Client) {
  cron.schedule("*/15 * * * *", async () => {
    const pending = await prisma.rulesGatePendingMember.findMany({ where: { remindedAt: null }, take: 100 });
    for (const row of pending) {
      const settings = await prisma.rulesGateSettings.findUnique({ where: { guildId: row.guildId } });
      if (!settings?.reminderEnabled) continue;

      const enabled = await isModuleEnabled(row.guildId, "RULES_GATE");
      if (!enabled) continue;

      const elapsedHours = (Date.now() - row.joinedAt.getTime()) / 3_600_000;
      if (elapsedHours < settings.reminderDelayHours) continue;

      const guild = await client.guilds.fetch(row.guildId).catch(() => null);
      if (!guild) {
        await prisma.rulesGatePendingMember.update({ where: { id: row.id }, data: { remindedAt: new Date() } }).catch(() => null);
        continue;
      }

      const member = await guild.members.fetch(row.userId).catch(() => null);
      if (member && !(settings.roleId && member.roles.cache.has(settings.roleId))) {
        const message = (settings.reminderMessage || DEFAULT_REMINDER).replace(/\{server\}/g, guild.name);
        await member.send(message).catch(() => null);
      }

      await prisma.rulesGatePendingMember.update({ where: { id: row.id }, data: { remindedAt: new Date() } }).catch(() => null);
    }
  });
}
