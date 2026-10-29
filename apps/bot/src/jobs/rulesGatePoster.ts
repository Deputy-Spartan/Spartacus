import cron from "node-cron";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder } from "discord.js";
import { prisma } from "../lib/prisma";
import { logError } from "@spartacus/db";
import { isSendableChannel } from "../lib/channels";
import { isModuleEnabled } from "../lib/moduleGate";
import { resolveSavedEmbed, buildSavedEmbedPayload } from "../lib/savedEmbedRender";
import type { RulesGateSettings, RulesGateSection } from "@prisma/client";

function agreeRow(settings: RulesGateSettings) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`rulesgate:agree:${settings.id}`).setLabel("✅ I Agree").setStyle(ButtonStyle.Success)
  );
  if (settings.declineEnabled) {
    row.addComponents(new ButtonBuilder().setCustomId(`rulesgate:decline:${settings.id}`).setLabel("❌ I Don't Agree").setStyle(ButtonStyle.Danger));
  }
  return row;
}

// Up to 4 section buttons on a second row, keeping the two rows well under
// Discord's 5-components-per-row / 25-total limits.
function sectionRow(settingsId: string, sections: RulesGateSection[]) {
  if (sections.length === 0) return null;
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const section of sections.slice(0, 4)) {
    row.addComponents(new ButtonBuilder().setCustomId(`rulesgate:section:${settingsId}:${section.id}`).setLabel(section.label).setStyle(ButtonStyle.Secondary));
  }
  return row;
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
            .setTitle(settings.defaultEmbedTitle || "📜 Server Rules")
            .setDescription(settings.defaultEmbedDescription || "Click the button below to confirm you've read and agree to the rules."),
        ],
      };

  const sections = await prisma.rulesGateSection.findMany({ where: { settingsId: settings.id }, orderBy: { sortOrder: "asc" } });
  const rows = [...(payload.components ?? []), agreeRow(settings)];
  const secondRow = sectionRow(settings.id, sections);
  if (secondRow) rows.push(secondRow);

  const message = await channel
    .send({ ...payload, components: rows })
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
