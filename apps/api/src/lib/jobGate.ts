// The API's background pollers (error alerts, status channel, deploy tracker)
// would also post twice while two copies run during a deploy. When the bot
// runs in this process, they follow the bot's "active copy" switch
// (apps/bot/src/lib/leader.ts). When the bot runs as its own service, this
// process is the only API copy that posts, so they always run.
let check: () => boolean = () => process.env.RUN_BOT_INLINE === "false";

export function setLeaderCheck(fn: () => boolean) {
  check = fn;
}

export function shouldRunJobs() {
  return check();
}
