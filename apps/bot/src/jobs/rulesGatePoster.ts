import cron from "node-cron";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder } from "discord.js";
import { prisma } from "../lib/prisma";
import { logError } from "@spartacus/db";
import { isSendableChannel } from "../lib/channels";
import { isModuleEnabled } from "../lib/moduleGate";

// Posts the "I Agree" gate button for any RulesGateSettings row that has a
// channel configured but no live message yet (changing the channel via the
// dashboard clears messageId so this redraws it there instead). Mirrors
// apps/bot/src/jobs/rolePanelPoster.ts.
//
// Note: there's no separate "rules text" field in the schema — admins are
// expected to post their actual rules as a normal message in the configured
// channel themselves. This panel only adds the agree-button gate below it.
export function startRulesGatePosterJob(client: Client) {
  cron.schedule("* * * * *", async () => {
    let loggedThisTick = 0;
    const pending = await prisma.rulesGateSettings.findMany({
      where: { channelId: { not: null }, messageId: null },
      take: 20,
    });

    for (const settings of pending) {
      if (!settings.channelId) continue;
      const enabled = await isModuleEnabled(settings.guildId, "RULES_GATE");
      if (!enabled) continue;

      const channel = await client.channels.fetch(settings.channelId).catch(() => null);
      if (!isSendableChannel(channel)) continue;

      const embed = new EmbedBuilder()
        .setColor(0x3b82f6)
        .setTitle("📜 Server Rules")
        .setDescription("Click the button below to confirm you've read and agree to the rules.");

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`rulesgate:agree:${settings.id}`)
          .setLabel("✅ I Agree")
          .setStyle(ButtonStyle.Success)
      );

      const message = await channel.send({ embeds: [embed], components: [row] }).catch((err) => {
        if (loggedThisTick < 5) { logError("bot", err, settings.guildId); loggedThisTick++; }
        return null;
      });
      if (message) await prisma.rulesGateSettings.update({ where: { id: settings.id }, data: { messageId: message.id } });
    }
  });
}
