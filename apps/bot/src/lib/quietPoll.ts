import { changedWithin } from "@spartacus/db";

// For jobs that look for newly made things to post (polls, role panels).
// They are scheduled every 5 seconds so a panel made on the dashboard shows
// up in Discord almost at once, but nearly every one of those looks finds
// nothing. shouldLook() says yes on every turn for a minute after anything
// was saved (see markChange in packages/db), and otherwise once every 20
// seconds, which still catches anything queued some other way.
const ACTIVE_MS = 60_000;
const QUIET_EVERY_MS = 20_000;
const lastLook = new Map<string, number>();

export function shouldLook(job: string, now = Date.now()): boolean {
  if (changedWithin(ACTIVE_MS) || now - (lastLook.get(job) ?? 0) >= QUIET_EVERY_MS) {
    lastLook.set(job, now);
    return true;
  }
  return false;
}
