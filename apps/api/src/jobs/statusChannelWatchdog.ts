import { prisma } from "@spartacus/db";
import { editChannelMessage } from "../lib/discordRest";

// Runs inside the API process, not the bot's gateway connection — the whole
// point is to still work when the bot itself is dead or mid-crash-loop.
// apps/bot/src/jobs/statusChannelPoster.ts posts the "online" embed and
// keeps it fresh every minute while the bot is alive; this only ever steps
// in to flip it to "offline" once that stops happening, and steps back out
// (does nothing) the moment the bot's own job resumes updating it.
const STALE_AFTER_MS = 60_000;
const CHECK_INTERVAL_MS = 30_000;

let lastKnownOnline: boolean | null = null;

async function checkAndAnnounce() {
  const config = await prisma.botConfig.findUnique({ where: { id: "singleton" } });
  const lastHeartbeatAt = config?.lastHeartbeatAt ?? null;
  const online = !!lastHeartbeatAt && Date.now() - lastHeartbeatAt.getTime() < STALE_AFTER_MS;

  // Only act on the online -> offline transition. Going offline -> online is
  // left entirely to the bot's own job posting fresh "online" embeds once
  // it's back — editing here too would just race it.
  if (online || lastKnownOnline === false) {
    lastKnownOnline = online;
    return;
  }
  lastKnownOnline = online;

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

export function startStatusChannelWatchdog() {
  checkAndAnnounce();
  setInterval(checkAndAnnounce, CHECK_INTERVAL_MS);
}
