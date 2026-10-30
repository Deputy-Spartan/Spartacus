import { prisma } from "@spartacus/db";
import { editChannelMessage, getChannelName, postChannelMessage, setChannelName } from "../lib/discordRest";
import { getEffectiveBotStatus, type BotPhase } from "../lib/botStatus";

// Runs inside the API process, not the bot's gateway connection — the whole
// point is to still work when the bot itself is dead or mid-crash-loop.
// apps/bot/src/jobs/statusChannelPoster.ts posts the "online" embed and
// keeps it fresh every minute while the bot is alive; this only ever steps
// in when that stops happening, and steps back out (does nothing) the
// moment the bot's own job resumes updating it.
//
// It also owns the uptime-history log: a separate, append-only channel
// (distinct from the live status embed) that gets one message per
// went-offline / back-online event, backed by UptimeIncident rows so
// duration can be reported. A deploy's brief "Updating" window and any
// owner-set manual override are deliberately NOT treated as incidents —
// those are expected/intentional states, not outages.
const CHECK_INTERVAL_MS = 30_000;
const STALE_INCIDENT_MS = 24 * 60 * 60_000;

let lastPhase: BotPhase | null = null;
let lastWasManual = false;
let lastWasDashboardDeploy = false;
let lastAnnouncedMessage: string | null = null;
let openIncidentId: string | null = null;

async function postToUptimeChannels(payload: unknown) {
  const settings = await prisma.alertSettings.findMany({ where: { uptimeChannelId: { not: null } } });
  for (const s of settings) {
    await postChannelMessage(s.uptimeChannelId as string, payload).catch(() => null);
  }
}

async function editPrimaryStatusChannels(embed: Record<string, unknown>) {
  const rows = await prisma.statusChannel.findMany({ where: { messageId: { not: null } }, take: 200 });
  for (const row of rows) {
    const enabled = await prisma.moduleToggle
      .findUnique({ where: { guildId_key: { guildId: row.guildId, key: "STATUS_CHANNEL" } } })
      .catch(() => null);
    if (!enabled?.enabled) continue;

    await editChannelMessage(row.channelId, row.messageId as string, { embeds: [embed] }).catch(() => null);
  }
}

// Prefixes each status channel's name with a colored dot (🟢・spartacus)
// that follows the phase. Runs every tick but only calls Discord when the
// name actually needs to change — Discord allows ~2 renames per channel
// per 10 minutes, so a rate-limited rename just retries on a later tick
// and the name catches up a few minutes behind the embed.
const PHASE_DOT: Record<BotPhase, string> = { online: "🟢", updating: "🟡", offline: "🔴" };
const LEADING_DOT = /^(?:🟢|🟡|🔴)[・\-│|\s]*/u;
const knownChannelNames = new Map<string, string>();

async function syncStatusChannelNames(phase: BotPhase) {
  const rows = await prisma.statusChannel.findMany({ take: 200 });
  for (const row of rows) {
    const enabled = await prisma.moduleToggle
      .findUnique({ where: { guildId_key: { guildId: row.guildId, key: "STATUS_CHANNEL" } } })
      .catch(() => null);
    if (!enabled?.enabled) continue;

    const current = knownChannelNames.get(row.channelId) ?? (await getChannelName(row.channelId));
    if (!current) continue;
    const desired = `${PHASE_DOT[phase]}・${current.replace(LEADING_DOT, "")}`;
    if (current === desired) {
      knownChannelNames.set(row.channelId, current);
      continue;
    }
    const result = await setChannelName(row.channelId, desired);
    if (result.error) knownChannelNames.delete(row.channelId); // re-read and retry next tick
    else knownChannelNames.set(row.channelId, desired);
  }
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

async function announceManual(phase: BotPhase, message: string | null) {
  const byPhase: Record<BotPhase, { color: number; title: string }> = {
    online: { color: 0x22c55e, title: "🟢 Spartacus is Online" },
    updating: { color: 0xf59e0b, title: "🟡 Spartacus is Under Maintenance" },
    offline: { color: 0xef4444, title: "🔴 Spartacus is Offline" },
  };
  const { color, title } = byPhase[phase];

  await editPrimaryStatusChannels({
    color,
    title,
    description: message ?? undefined,
    footer: { text: "Set manually" },
    timestamp: new Date().toISOString(),
  });
}

async function announceUpdating(dashboardOnly: boolean) {
  await editPrimaryStatusChannels({
    color: 0xf59e0b, // amber — matches the dashboard's updating indicator
    title: "🟡 Spartacus is Updating",
    description: dashboardOnly
      ? "A new update is rolling out. The bot may restart briefly — this will flip back to Online once it's live."
      : "Deploying a new version. This will refresh automatically once it's back.",
    footer: { text: "Last updated" },
    timestamp: new Date().toISOString(),
  });
  // Deliberately no uptime-incident row and no uptime-channel post here —
  // this is an expected restart, not an outage.
}

async function announceOffline() {
  const incident = await prisma.uptimeIncident.create({ data: {} });
  openIncidentId = incident.id;

  const lastError = await prisma.errorLog.findFirst({ orderBy: { createdAt: "desc" } });

  await postToUptimeChannels({
    embeds: [
      {
        color: 0xef4444,
        title: "🔴 Spartacus went offline",
        description: lastError ? `Last known error: ${lastError.message.slice(0, 200)}` : undefined,
        footer: { text: "Check the dashboard's Errors page for details" },
        timestamp: incident.startedAt.toISOString(),
      },
    ],
  });

  await editPrimaryStatusChannels({
    color: 0xef4444,
    title: "🔴 Spartacus is Offline",
    description: "The bot lost its connection. This will update automatically once it's back.",
    footer: { text: "Last updated" },
    timestamp: new Date().toISOString(),
  });
}

async function announceRecovery() {
  if (!openIncidentId) return;
  const id = openIncidentId;
  openIncidentId = null;
  // Claimed atomically (only closes if still open) so that when two copies
  // of this process overlap — Render starts the new instance before
  // stopping the old one on every deploy — only one of them announces it.
  const endedAt = new Date();
  const claimed = await prisma.uptimeIncident.updateMany({ where: { id, endedAt: null }, data: { endedAt } });
  if (claimed.count === 0) return;
  const incident = await prisma.uptimeIncident.findUniqueOrThrow({ where: { id } });

  const duration = formatDuration(incident.endedAt!.getTime() - incident.startedAt.getTime());
  await postToUptimeChannels({
    embeds: [{ color: 0x22c55e, title: "🟢 Spartacus is back online", description: `Was offline for ${duration}.`, timestamp: incident.endedAt!.toISOString() }],
  });
  // The primary status embed is left alone here — apps/bot's own
  // statusChannelPoster job takes over posting fresh "online" updates to it
  // the moment the bot is actually back, avoiding a race between the two.
}

// A rolled-out update ends with the bot having been up the whole time,
// so there's no incident to close — just flip the embed straight back to
// online instead of leaving "Updating" up until the bot's next minute tick.
async function announceDashboardDeployDone() {
  await editPrimaryStatusChannels({
    color: 0x22c55e,
    title: "🟢 Spartacus is Online",
    description: "Update published.",
    footer: { text: "Last updated" },
    timestamp: new Date().toISOString(),
  });
}

async function checkAndAnnounce() {
  const status = await getEffectiveBotStatus();
  const previousPhase = lastPhase;
  const wasManual = lastWasManual;
  const wasDashboardDeploy = lastWasDashboardDeploy;
  lastPhase = status.phase;
  lastWasManual = status.manual;
  lastWasDashboardDeploy = !!status.dashboardDeployingSince;
  await syncStatusChannelNames(status.phase).catch(() => null);

  // An owner-set override fully bypasses the auto incident/recovery
  // machinery below — it's an intentional state, not something to log as
  // an outage. Only re-edit the embed on an actual change, not every tick.
  if (status.manual) {
    const messageChanged = status.message !== lastAnnouncedMessage;
    lastAnnouncedMessage = status.message;
    if (previousPhase !== status.phase || !wasManual || messageChanged) await announceManual(status.phase, status.message);
    return;
  }
  lastAnnouncedMessage = null;

  if (previousPhase === null) {
    // First check after this process starts: if the bot's already up, any
    // outage left open from before the restart ended by now — close it
    // here, or it would sit open until the next online transition and
    // report a wildly wrong duration then.
    if (status.phase === "online") await announceRecovery();
    return;
  }
  const isDashboardDeploy = !!status.dashboardDeployingSince;
  if (previousPhase === status.phase && wasDashboardDeploy === isDashboardDeploy) return; // no change

  if (status.phase === "updating") await announceUpdating(isDashboardDeploy);
  else if (status.phase === "offline" && previousPhase !== "offline") await announceOffline();
  else if (status.phase === "online" && wasDashboardDeploy && !openIncidentId) await announceDashboardDeployDone();
  else if (status.phase === "online" && previousPhase !== "online") await announceRecovery();
}

// Called right after the manual-override setting is saved (see
// apps/api/src/routes/botConfig.ts) so the Discord embed updates within
// the same request instead of waiting up to CHECK_INTERVAL_MS.
export async function refreshStatusNow() {
  await checkAndAnnounce();
}

export async function startStatusChannelWatchdog() {
  // Recover across a restart of this process itself (e.g. this API's own
  // deploy) — otherwise an incident opened before the restart would never
  // get closed out or announced as recovered.
  // Only a recent one is worth announcing; anything older (or any extra
  // open rows) is left over from a missed close, so it's closed quietly
  // rather than posted with a bogus multi-day duration.
  const open = await prisma.uptimeIncident.findMany({ where: { endedAt: null }, orderBy: { startedAt: "desc" } });
  const recent = open[0] && Date.now() - open[0].startedAt.getTime() < STALE_INCIDENT_MS ? open[0] : null;
  const stale = open.filter((i) => i !== recent).map((i) => i.id);
  if (stale.length) await prisma.uptimeIncident.updateMany({ where: { id: { in: stale } }, data: { endedAt: new Date() } });
  if (recent) openIncidentId = recent.id;

  checkAndAnnounce();
  setInterval(checkAndAnnounce, CHECK_INTERVAL_MS);
}
