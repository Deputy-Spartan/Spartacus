import cron from "node-cron";
import { Client } from "discord.js";
import { prisma } from "../lib/prisma";
import { logError } from "@spartacus/db";
import { isModuleEnabled } from "../lib/moduleGate";
import { VERIFY_DEFAULTS, logVerification } from "../modules/security/verification";

// Every 15 minutes: DM a reminder to members who haven't verified after the
// set delay, and kick anyone still unverified after the kick time. Keyed off
// VerificationPendingMember rows made on join and deleted on verify.
export function startVerificationReminderJob(client: Client) {
  cron.schedule("*/15 * * * *", async () => {
    const pending = await prisma.verificationPendingMember.findMany({ take: 300, orderBy: { joinedAt: "asc" } });
    const configs = new Map<string, Awaited<ReturnType<typeof prisma.verificationConfig.findUnique>>>();
    const now = Date.now();

    for (const row of pending) {
      if (!configs.has(row.guildId)) configs.set(row.guildId, await prisma.verificationConfig.findUnique({ where: { guildId: row.guildId } }));
      const config = configs.get(row.guildId);
      if (!config?.verifiedRoleId || (!config.reminderEnabled && !config.kickEnabled)) continue;
      if (!(await isModuleEnabled(row.guildId, "VERIFICATION"))) continue;

      const hours = (now - row.joinedAt.getTime()) / 3_600_000;
      const wantsKick = config.kickEnabled && hours >= config.kickAfterHours;
      const wantsReminder = config.reminderEnabled && !row.remindedAt && hours >= config.reminderDelayHours && !wantsKick;
      if (!wantsKick && !wantsReminder) continue;

      const guild = client.guilds.cache.get(row.guildId);
      const member = guild ? await guild.members.fetch(row.userId).catch(() => null) : null;
      // Left, or verified some other way: stop tracking them.
      if (!guild || !member || member.roles.cache.has(config.verifiedRoleId)) {
        await prisma.verificationPendingMember.delete({ where: { id: row.id } }).catch(() => null);
        continue;
      }
      const tokens = (t: string | null, d: string) => (t?.trim() ? t : d).replace(/\{server\}/g, guild.name);

      if (wantsKick) {
        await member.send(tokens(config.kickMessage, VERIFY_DEFAULTS.kick)).catch(() => null);
        const kicked = member.kickable ? await member.kick(`Didn't verify within ${config.kickAfterHours} hours`).then(() => true, (err) => (logError("bot", err, guild.id), false)) : false;
        await prisma.verificationPendingMember.delete({ where: { id: row.id } }).catch(() => null);
        if (kicked) {
          await logVerification(guild.id, member, "KICKED", `Didn't verify within ${config.kickAfterHours} hours`);
          if (config.logChannelId) {
            const ch = await guild.channels.fetch(config.logChannelId).catch(() => null);
            if (ch?.isTextBased()) await ch.send(`👢 <@${member.id}> was kicked for not verifying within ${config.kickAfterHours} hours.`).catch(() => null);
          }
        }
        continue;
      }

      await member.send(tokens(config.reminderMessage, VERIFY_DEFAULTS.reminder)).catch(() => null);
      await prisma.verificationPendingMember.update({ where: { id: row.id }, data: { remindedAt: new Date() } }).catch(() => null);
    }
  });
}
