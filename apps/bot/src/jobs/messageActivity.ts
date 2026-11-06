import { logError } from "@spartacus/db";
import { prisma } from "../lib/prisma";

// Counts messages per guild, UTC hour and channel in memory, then saves the
// totals once a minute, so a busy server costs a handful of writes a minute
// instead of one per message. Only counts: no message text or author.
const pending = new Map<string, number>();

export function countMessageActivity(guildId: string, channelId: string, at = new Date()) {
  const day = at.toISOString().slice(0, 10);
  const key = `${guildId}|${day}|${at.getUTCHours()}|${channelId}`;
  pending.set(key, (pending.get(key) ?? 0) + 1);
}

async function flush() {
  if (!pending.size) return;
  const batch = [...pending.entries()];
  pending.clear();
  for (const [key, count] of batch) {
    const [guildId, day, hour, channelId] = key.split("|");
    const date = new Date(`${day}T00:00:00.000Z`);
    await prisma.messageActivity
      .upsert({
        where: { guildId_day_hour_channelId: { guildId, day: date, hour: Number(hour), channelId } },
        create: { guildId, day: date, hour: Number(hour), channelId, count },
        update: { count: { increment: count } },
      })
      .catch((err) => logError("bot", err, guildId));
  }
}

let lastCleanup = 0;
async function cleanup() {
  if (Date.now() - lastCleanup < 6 * 60 * 60 * 1000) return;
  lastCleanup = Date.now();
  const cutoff = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
  await prisma.messageActivity.deleteMany({ where: { day: { lt: cutoff } } }).catch((err) => logError("bot", err));
}

export function startMessageActivityJob() {
  setInterval(() => {
    flush()
      .then(cleanup)
      .catch((err) => logError("bot", err));
  }, 60 * 1000);
}
