import { randomUUID } from "crypto";
import cron from "node-cron";
import { prisma } from "./prisma";

// One active copy of the bot at a time.
//
// During a deploy Render runs the old and the new copy side by side until the
// new one is healthy, and Discord sends every event to both. Without this,
// both copies answered the same @mention, posted the same log line, and ran
// the same scheduled jobs. Now the newest copy takes over as soon as it has
// connected to Discord, and the old copy stops acting within a few seconds
// (it keeps its connection and the API until Render shuts it down).
//
// The active copy refreshes a heartbeat row. If it dies without handing
// over, another copy takes over once the heartbeat is STALE_MS old.

const ID = randomUUID();
const ROW = "bot";
const CHECK_MS = 3_000;
const STALE_MS = 25_000;

let leader = false;
let loopStarted = false;
let lastBeat = 0;

export function isLeader() {
  return leader;
}

function setLeader(next: boolean, why: string) {
  if (next !== leader) console.log(`[leader] ${next ? "This copy is now active" : "Another copy took over; this copy is standing by"} (${why}).`);
  leader = next;
}

// Called when this copy's Discord connection is ready: newest copy wins.
export async function takeLeadership() {
  try {
    await prisma.botLeader.upsert({
      where: { id: ROW },
      create: { id: ROW, instanceId: ID, heartbeatAt: new Date() },
      update: { instanceId: ID, heartbeatAt: new Date() },
    });
    setLeader(true, "connected to Discord");
  } catch (err) {
    // Without the database there's no way to coordinate; acting is better
    // than a silent bot.
    console.error("[leader] Could not record this copy as active:", (err as Error).message);
    setLeader(true, "database unavailable");
  }
}

async function check() {
  try {
    const row = await prisma.botLeader.findUnique({ where: { id: ROW } });
    if (!row) {
      await prisma.botLeader.create({ data: { id: ROW, instanceId: ID, heartbeatAt: new Date() } }).catch(() => null);
    } else if (row.instanceId === ID) {
      // Still the active copy: one read is enough, and the heartbeat only
      // needs refreshing every few seconds (it goes stale after 25).
      if (Date.now() - lastBeat > 8_000) {
        await prisma.botLeader.update({ where: { id: ROW }, data: { heartbeatAt: new Date() } });
        lastBeat = Date.now();
      }
      setLeader(true, "heartbeat");
      return;
    } else if (Date.now() - row.heartbeatAt.getTime() > STALE_MS) {
      // Only take over if nobody else did in the meantime.
      await prisma.botLeader.updateMany({ where: { id: ROW, instanceId: row.instanceId }, data: { instanceId: ID, heartbeatAt: new Date() } });
    }
    const now = await prisma.botLeader.findUnique({ where: { id: ROW } });
    setLeader(now?.instanceId === ID, now?.instanceId === ID ? "heartbeat" : "newer copy running");
  } catch {
    // A database blip keeps the current state rather than flapping.
  }
}

export function startLeaderLoop() {
  if (loopStarted) return;
  loopStarted = true;
  void check();
  setInterval(() => void check(), CHECK_MS);
  // Hand over straight away when Render stops this copy.
  process.once("SIGTERM", () => {
    if (!leader) return;
    leader = false;
    void prisma.botLeader
      .updateMany({ where: { id: ROW, instanceId: ID }, data: { heartbeatAt: new Date(0) } })
      .catch(() => null);
  });
}

// Every scheduled job uses cron.schedule. Wrapping it here means a job's run
// is skipped on a copy that isn't active, without touching each job file.
type Schedule = typeof cron.schedule;
const realSchedule: Schedule = cron.schedule.bind(cron);

// About twenty jobs are set to run at the top of every minute. Starting them
// all in the same second made every query wait in one queue (the database pool
// is small), so each gets its own second instead.
let minuteJobs = 0;
const spread = (expression: string) => (expression.trim() === "* * * * *" ? `${(minuteJobs++ * 7) % 60} * * * * *` : expression);

// A job that is still running when its next turn comes round skips that turn.
// Without this, one slow moment at the database stacked a second and third
// copy of the same job behind the first (some run every 5 seconds), each
// holding connections, which made the slow moment longer for everything else.
// A run that never finishes stops blocking after STUCK_MS.
const STUCK_MS = 5 * 60_000;
const startedAt = new Map<number, number>();
let jobCount = 0;

(cron as { schedule: Schedule }).schedule = ((expression: string, func: (...a: unknown[]) => unknown, options?: unknown) => {
  const job = jobCount++;
  return realSchedule(
    spread(expression),
    (async (...args: unknown[]) => {
      if (!leader) return;
      const since = startedAt.get(job);
      if (since !== undefined && Date.now() - since < STUCK_MS) return;
      startedAt.set(job, Date.now());
      try {
        await func(...args);
      } finally {
        startedAt.delete(job);
      }
    }) as Parameters<Schedule>[1],
    options as Parameters<Schedule>[2],
  );
}) as Schedule;
