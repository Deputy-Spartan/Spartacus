import cron from "node-cron";
import { Client } from "discord.js";
import { prisma } from "../lib/prisma";
import { logError } from "@spartacus/db";
import { isSendableChannel } from "../lib/channels";
import { isModuleEnabled } from "../lib/moduleGate";

// Each scheduled message carries its own cron expression, so we let
// node-cron's validator check it and just re-verify "is it due right now"
// against lastSentAt to avoid double-sends within the same minute.
export function startScheduledMessagesJob(client: Client) {
  cron.schedule("* * * * *", async () => {
    const messages = await prisma.scheduledMessage.findMany({ take: 200 });
    const now = new Date();
    let loggedThisTick = 0;

    for (const msg of messages) {
      if (!(await isModuleEnabled(msg.guildId, "SCHEDULED_MESSAGES"))) continue;
      if (!cron.validate(msg.cronExpr)) continue;

      // A minute-resolution "due now" check: has this cron expression's
      // matcher fired within the last 60s and we haven't already sent it.
      const alreadySentThisMinute = msg.lastSentAt && now.getTime() - msg.lastSentAt.getTime() < 55_000;
      if (alreadySentThisMinute) continue;

      const isDue = isCronDueNow(msg.cronExpr, now);
      if (!isDue) continue;

      const channel = await client.channels.fetch(msg.channelId).catch(() => null);
      if (isSendableChannel(channel)) {
        await channel.send(msg.content).catch((err) => {
          if (loggedThisTick < 5) { logError("bot", err, msg.guildId); loggedThisTick++; }
          return null;
        });
      }
      await prisma.scheduledMessage.update({ where: { id: msg.id }, data: { lastSentAt: now } });
    }
  });
}

// Minimal 5-field cron matcher (minute hour day month weekday) — enough for
// the schedules created via the dashboard without pulling in a full cron
// library, keeping bundle size (and thus RAM) small.
function isCronDueNow(expr: string, now: Date): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [min, hour, day, month, weekday] = parts;

  return (
    fieldMatches(min, now.getMinutes()) &&
    fieldMatches(hour, now.getHours()) &&
    fieldMatches(day, now.getDate()) &&
    fieldMatches(month, now.getMonth() + 1) &&
    fieldMatches(weekday, now.getDay())
  );
}

function fieldMatches(field: string, value: number): boolean {
  if (field === "*") return true;
  return field.split(",").some((part) => {
    if (part.includes("/")) {
      const [, step] = part.split("/");
      return value % Number(step) === 0;
    }
    return Number(part) === value;
  });
}
