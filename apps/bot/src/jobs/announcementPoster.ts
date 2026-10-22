import cron from "node-cron";
import { Client } from "discord.js";
import { prisma } from "../lib/prisma";
import { logError } from "@spartacus/db";
import { isSendableChannel } from "../lib/channels";
import { isModuleEnabled } from "../lib/moduleGate";
import { buildStickyPayload } from "../lib/stickyRender";
import { resolveSavedEmbed } from "../lib/savedEmbedRender";

// The one place an announcement actually gets sent to Discord — used both
// by the scheduled tick below and by the dashboard's "Publish Now" button
// (apps/api's announcements route, via getBotClient()), so a manual publish
// goes through the exact same module-enabled check and payload-building as
// a scheduled one instead of a separate raw-REST path.
export async function publishAnnouncement(client: Client, announcementId: string): Promise<{ ok: boolean; error?: string }> {
  const announcement = await prisma.announcement.findUnique({ where: { id: announcementId } });
  if (!announcement) return { ok: false, error: "Announcement not found" };
  if (announcement.sentAt) return { ok: false, error: "This announcement was already published." };

  const enabled = await isModuleEnabled(announcement.guildId, "ANNOUNCEMENTS");
  if (!enabled) return { ok: false, error: "The Announcements module is disabled for this server." };

  const channel = await client.channels.fetch(announcement.channelId).catch(() => null);
  if (!isSendableChannel(channel)) {
    await prisma.announcement.update({ where: { id: announcement.id }, data: { sentAt: new Date() } });
    return { ok: false, error: "That channel is no longer postable." };
  }

  const saved = await resolveSavedEmbed(announcement.savedEmbedId);
  const payload = await buildStickyPayload(
    {
      content: announcement.content ?? "",
      embedEnabled: announcement.embedEnabled,
      embedTitle: announcement.embedTitle,
      embedDescription: announcement.content,
      embedColor: announcement.embedColor,
      buttons: announcement.buttons,
      embedExtra: announcement.embedExtra,
    },
    { savedEmbed: saved, guildId: announcement.guildId }
  );

  const sent = await channel.send(payload).catch((err) => {
    logError("bot", err, announcement.guildId);
    return null;
  });
  await prisma.announcement.update({ where: { id: announcement.id }, data: { sentAt: new Date(), messageId: sent?.id ?? null } });

  return sent ? { ok: true } : { ok: false, error: "Discord rejected the message — check the channel and try again." };
}

// Checks every minute for announcements with a schedule that has now
// passed. An announcement with no schedule is never picked up here at all —
// it sits queued until someone hits "Publish Now" on the dashboard. That's
// deliberate: Announcements has no edit/update feature, so composing and
// saving one is meant to be a safe, reversible "queue it" step, with
// publishing itself as the one explicit, final action.
export function startAnnouncementPosterJob(client: Client) {
  cron.schedule("* * * * *", async () => {
    const due = await prisma.announcement.findMany({
      where: { sentAt: null, scheduledFor: { lte: new Date() } },
      take: 20,
    });

    for (const announcement of due) {
      await publishAnnouncement(client, announcement.id);
    }
  });
}
