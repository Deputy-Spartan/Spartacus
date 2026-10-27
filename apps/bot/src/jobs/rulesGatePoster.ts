import cron from "node-cron";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder } from "discord.js";
import { prisma } from "../lib/prisma";
import { logError } from "@spartacus/db";
import { isSendableChannel } from "../lib/channels";
import { isModuleEnabled } from "../lib/moduleGate";
import { resolveSavedEmbed, buildSavedEmbedPayload } from "../lib/savedEmbedRender";
import type { RulesGateSettings } from "@prisma/client";

function agreeRow(settingsId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`rulesgate:agree:${settingsId}`).setLabel("✅ I Agree").setStyle(ButtonStyle.Success)
  );
}

// Posts (or reposts after a channel change) one guild's gate panel —
// its full rules embed(s) from the Embed Creator if one's configured,
// otherwise a bare placeholder embed, always followed by the Agree button.
// Shared by the catch-up cron below and the dashboard's immediate "Save"
// trigger (see modules/community/rulesGate.ts's postRulesGateNow).
export async function postRulesGatePanel(client: Client, settings: RulesGateSettings): Promise<boolean> {
  if (!settings.channelId) return false;
  const enabled = await isModuleEnabled(settings.guildId, "RULES_GATE");
  if (!enabled) return false;

  const channel = await client.channels.fetch(settings.channelId).catch(() => null);
  if (!isSendableChannel(channel)) return false;

  const saved = await resolveSavedEmbed(settings.savedEmbedId);
  const payload = saved
    ? await buildSavedEmbedPayload(settings.guildId, saved)
    : {
        embeds: [
          new EmbedBuilder()
            .setColor(0x3b82f6)
            .setTitle("📜 Server Rules")
            .setDescription("Click the button below to confirm you've read and agree to the rules."),
        ],
      };

  const message = await channel
    .send({ ...payload, components: [...(payload.components ?? []), agreeRow(settings.id)] })
    .catch((err) => {
      logError("bot", err, settings.guildId);
      return null;
    });
  if (!message) return false;

  await prisma.rulesGateSettings.update({ where: { id: settings.id }, data: { messageId: message.id } });
  return true;
}

// Catch-up sweep every minute — covers the bot being offline when the
// dashboard's immediate post (postRulesGateNow) fired, or any row left
// pending for another reason.
export function startRulesGatePosterJob(client: Client) {
  cron.schedule("* * * * *", async () => {
    const pending = await prisma.rulesGateSettings.findMany({ where: { channelId: { not: null }, messageId: null }, take: 20 });
    for (const settings of pending) {
      await postRulesGatePanel(client, settings);
    }
  });
}
