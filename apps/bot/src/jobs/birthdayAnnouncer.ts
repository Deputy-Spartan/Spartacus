import cron from "node-cron";
import { EmbedBuilder, Client } from "discord.js";
import { prisma } from "../lib/prisma";
import { logError } from "@spartacus/db";
import { isSendableChannel } from "../lib/channels";
import { isModuleEnabled } from "../lib/moduleGate";
import { applyEmbedExtra } from "../lib/embedExtra";
import { resolveSavedEmbed, buildSavedEmbedPayload } from "../lib/savedEmbedRender";

// Runs once a day at 9am server time — posts one embed per birthday config
// per guild listing everyone whose birthday is today.
export function startBirthdayAnnouncerJob(client: Client) {
  cron.schedule("0 9 * * *", async () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();

    const birthdaysToday = await prisma.birthday.findMany({ where: { month, day } });
    if (birthdaysToday.length === 0) return;

    let loggedThisTick = 0;
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

      const channel = await client.channels.fetch(config.channelId).catch(() => null);
      if (!isSendableChannel(channel)) continue;

      const mentions = userIds.map((id) => `<@${id}>`).join(", ");
      const message = (config.embedMessage || "Everyone wish {user} a happy birthday! 🎉").replace(/{user}/g, mentions);

      const saved = await resolveSavedEmbed(config.savedEmbedId);
      let payload;
      if (saved) {
        payload = buildSavedEmbedPayload(saved);
      } else {
        const embed = new EmbedBuilder()
          .setColor((config.embedColor as `#${string}`) || "#FF69B4")
          .setTitle(config.embedTitle || "🎂 Happy Birthday!")
          .setDescription(message)
          .setTimestamp();
        applyEmbedExtra(embed, config.embedExtra);
        payload = { content: config.pingRoleId ? `<@&${config.pingRoleId}>` : undefined, embeds: [embed], components: [] };
      }

      await channel.send(payload).catch((err) => {
        if (loggedThisTick < 5) { logError("bot", err, guildId); loggedThisTick++; }
        return null;
      });
    }
  });
}
