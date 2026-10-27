import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, Client, EmbedBuilder, GuildMember } from "discord.js";
import { prisma } from "../../lib/prisma";
import { logError } from "@spartacus/db";
import { isSendableChannel } from "../../lib/channels";
import { isModuleEnabled } from "../../lib/moduleGate";
import { resolveSavedEmbed, buildSavedEmbedPayload } from "../../lib/savedEmbedRender";
import type { VerificationConfig } from "@prisma/client";

// Shared by both /verify and the panel's Verify button so the account-age
// check and role grant behave identically no matter which path a member uses.
export async function verifyMember(
  config: VerificationConfig | null,
  member: GuildMember,
  accountCreatedAt: number
): Promise<{ ok: boolean; message: string }> {
  if (!config?.verifiedRoleId) {
    return { ok: false, message: "Verification isn't configured for this server yet." };
  }

  const accountAgeDays = (Date.now() - accountCreatedAt) / (1000 * 60 * 60 * 24);
  if (accountAgeDays < config.minAccountAgeDays) {
    return { ok: false, message: `Your account must be at least ${config.minAccountAgeDays} day(s) old to verify.` };
  }

  if (member.roles.cache.has(config.verifiedRoleId)) {
    return { ok: true, message: "You're already verified!" };
  }

  await member.roles.add(config.verifiedRoleId).catch(() => null);
  return { ok: true, message: "✅ You're verified! Welcome to the server." };
}

function verifyRow() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("verify:click").setLabel("✅ Verify").setStyle(ButtonStyle.Success)
  );
}

export async function handleVerifyButton(interaction: ButtonInteraction) {
  if (!interaction.guildId || !interaction.member) return;

  const config = await prisma.verificationConfig.findUnique({ where: { guildId: interaction.guildId } });
  const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await interaction.reply({ content: "⚠️ Couldn't find your membership in this server.", ephemeral: true });
    return;
  }

  const result = await verifyMember(config, member, interaction.user.createdTimestamp);
  await interaction.reply({ content: result.message, ephemeral: true });
}

// Posts (or reposts after a channel/embed change) the verification panel —
// shared by the catch-up cron and the dashboard's immediate "Save" trigger.
export async function postVerificationPanel(client: Client, config: VerificationConfig): Promise<boolean> {
  if (!config.panelChannelId) return false;
  const enabled = await isModuleEnabled(config.guildId, "VERIFICATION");
  if (!enabled) return false;

  const channel = await client.channels.fetch(config.panelChannelId).catch(() => null);
  if (!isSendableChannel(channel)) return false;

  const saved = await resolveSavedEmbed(config.savedEmbedId);
  const payload = saved
    ? await buildSavedEmbedPayload(config.guildId, saved)
    : {
        embeds: [
          new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("✅ Verify Yourself")
            .setDescription("Click the button below to verify and gain access to the rest of the server."),
        ],
      };

  const message = await channel
    .send({ ...payload, components: [...(payload.components ?? []), verifyRow()] })
    .catch((err) => {
      logError("bot", err, config.guildId);
      return null;
    });
  if (!message) return false;

  await prisma.verificationConfig.update({ where: { id: config.id }, data: { panelMessageId: message.id } });
  return true;
}
