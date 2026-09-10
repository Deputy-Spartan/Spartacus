import { prisma } from "@spartacus/db";
import { editChannelMessage, postChannelMessage } from "../lib/discordRest";

// Runs inside the API process, not the bot's gateway connection — the whole
// point is to still work when the bot itself is dead or mid-crash-loop.
// apps/bot/src/jobs/statusChannelPoster.ts posts the "online" embed and
// keeps it fresh every minute while the bot is alive; this only ever steps
// in to flip it to "offline" once that stops happening, and steps back out
// (does nothing) the moment the bot's own job resumes updating it.
//
// It also owns the uptime-history log: a separate, append-only channel
// (distinct from the live status embed) that gets one message per
// went-offline / back-online event, backed by UptimeIncident rows so
// duration can be reported.
const STALE_AFTER_MS = 60_000;
const CHECK_INTERVAL_MS = 30_000;

let lastKnownOnline: boolean | null = null;
let openIncidentId: string | null = null;

async function postToUptimeChannels(payload: unknown) {
  const settings = await prisma.alertSettings.findMany({ where: { uptimeChannelId: { not: null } } });
  for (const s of settings) {
    await postChannelMessage(s.uptimeChannelId as string, payload).catch(() => null);
  }
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

async function announceOffline() {
  const incident = await prisma.uptimeIncident.create({ data: {} });
  openIncidentId = incident.id;

  await postToUptimeChannels({
    embeds: [{ color: 0xef4444, title: "🔴 Spartacus went offline", timestamp: incident.startedAt.toISOString() }],
  });

  const rows = await prisma.statusChannel.findMany({ where: { messageId: { not: null } }, take: 200 });
  for (const row of rows) {
    const enabled = await prisma.moduleToggle
      .findUnique({ where: { guildId_key: { guildId: row.guildId, key: "STATUS_CHANNEL" } } })
      .catch(() => null);
    if (!enabled?.enabled) continue;

    await editChannelMessage(row.channelId, row.messageId as string, {
      embeds: [
        {
          color: 0x64748b, // slate — matches the dashboard's offline grey
          title: "🔴 Spartacus is Offline",
          description: "The bot lost its connection. This will update automatically once it's back.",
          footer: { text: "Last updated" },
          timestamp: new Date().toISOString(),
        },
      ],
    }).catch(() => null);
  }
}

async function announceRecovery() {
  if (!openIncidentId) return;
  const incident = await prisma.uptimeIncident.update({ where: { id: openIncidentId }, data: { endedAt: new Date() } });
  openIncidentId = null;

  const duration = formatDuration(incident.endedAt!.getTime() - incident.startedAt.getTime());
  await postToUptimeChannels({
    embeds: [{ color: 0x22c55e, title: "🟢 Spartacus is back online", description: `Was offline for ${duration}.`, timestamp: incident.endedAt!.toISOString() }],
  });
  // The primary status embed is left alone here — apps/bot's own
  // statusChannelPoster job takes over posting fresh "online" updates to it
  // the moment the bot is actually back, avoiding a race between the two.
}

async function checkAndAnnounce() {
  const config = await prisma.botConfig.findUnique({ where: { id: "singleton" } });
  const lastHeartbeatAt = config?.lastHeartbeatAt ?? null;
  const online = !!lastHeartbeatAt && Date.now() - lastHeartbeatAt.getTime() < STALE_AFTER_MS;

  const wasOnline = lastKnownOnline;
  lastKnownOnline = online;

  if (wasOnline === null) return; // first check after boot — nothing to compare against yet
  if (wasOnline === true && online === false) await announceOffline();
  else if (wasOnline === false && online === true) await announceRecovery();
}

export async function startStatusChannelWatchdog() {
  // Recover across a restart of this process itself (e.g. this API's own
  // deploy) — otherwise an incident opened before the restart would never
  // get closed out or announced as recovered.
  const openIncident = await prisma.uptimeIncident.findFirst({ where: { endedAt: null }, orderBy: { startedAt: "desc" } });
  if (openIncident) openIncidentId = openIncident.id;

  checkAndAnnounce();
  setInterval(checkAndAnnounce, CHECK_INTERVAL_MS);
}
