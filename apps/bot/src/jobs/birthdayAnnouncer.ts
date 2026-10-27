import cron from "node-cron";
import { Client } from "discord.js";
import { prisma } from "../lib/prisma";
import { logError } from "@spartacus/db";
import { isSendableChannel } from "../lib/channels";
import { isModuleEnabled } from "../lib/moduleGate";
import { resolveSavedEmbed, buildSavedEmbedPayload } from "../lib/savedEmbedRender";
import type { BirthdayConfig } from "@prisma/client";

// Builds and sends one guild's birthday announcement for the given list of
// member ids — shared by the daily cron below and sendBirthdayTest (the
// dashboard's "Send Test" button).
export async function postBirthdayAnnouncement(client: Client, config: BirthdayConfig, userIds: string[], options: { isTest?: boolean } = {}): Promise<{ ok: boolean; error?: string }> {
  if (!config.channelId) return { ok: false, error: "Set a birthday channel first." };

  const channel = await client.channels.fetch(config.channelId).catch(() => null);
  if (!isSendableChannel(channel)) return { ok: false, error: "The configured channel isn't postable." };

  const prefix = options.isTest ? "🧪 **Test birthday announcement** — only you triggered this, it's not actually your birthday on file.\n" : "";
  const mentions = userIds.map((id) => `<@${id}>`).join(", ");
  const message = (config.embedMessage || "Everyone wish {user} a happy birthday! 🎉").replace(/{user}/g, mentions);

  const saved = await resolveSavedEmbed(config.savedEmbedId);
  const sent = saved
    ? await channel.send({ ...(await buildSavedEmbedPayload(config.guildId, saved)), content: prefix || undefined }).catch((err) => {
        logError("bot", err, config.guildId);
        return null;
      })
    : await channel
        .send({ content: `${prefix}${config.pingRoleId ? `<@&${config.pingRoleId}> ` : ""}${message}` })
        .catch((err) => {
          logError("bot", err, config.guildId);
          return null;
        });

  return sent ? { ok: true } : { ok: false, error: "Failed to post — check the bot's permissions in that channel." };
}

// Dashboard's "Send Test" button — announces a birthday for the clicking
// admin's own account, standing in for a real birthday match.
export async function sendBirthdayTest(client: Client, guildId: string, callerId: string): Promise<{ ok: boolean; error?: string }> {
  const config = await prisma.birthdayConfig.findUnique({ where: { guildId } });
  if (!config) return { ok: false, error: "Set a birthday channel first." };
  return postBirthdayAnnouncement(client, config, [callerId], { isTest: true });
}

// Runs once a day at 9am server time — posts one embed per birthday config
// per guild listing everyone whose birthday is today.
export function startBirthdayAnnouncerJob(client: Client) {
  cron.schedule("0 9 * * *", async () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();

    const birthdaysToday = await prisma.birthday.findMany({ where: { month, day } });
    if (birthdaysToday.length === 0) return;

    const byGuild = new Map<string, string[]>();
    for (const b of birthdaysToday) {
      const list = byGuild.get(b.guildId) ?? [];
      list.push(b.userId);
      byGuild.set(b.guildId, list);
    }

    for (const [guildId, userIds] of byGuild) {
      const enabled = await isModuleEnabled(guildId, "BIRTHDAYS");
      if (!enabled) continue;

      const config = await prisma.birthdayConfig.findUnique({ where: { guildId } });
      if (!config?.channelId) continue;

      await postBirthdayAnnouncement(client, config, userIds);
    }
  });
}
