import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { prisma } from "../../lib/prisma";
import { logCase } from "../../lib/cases";
import { isSendableChannel } from "../../lib/channels";

// Member clicks "Appeal" on the DM sent from cases.ts's sendAppealDm() —
// opens a modal asking for their reason. caseId identifies which
// ModerationCase (a BAN or MUTE) is being appealed.
export async function handleAppealStart(interaction: ButtonInteraction, caseId: string) {
  const modal = new ModalBuilder()
    .setCustomId(`appealmodal:${caseId}`)
    .setTitle("Submit an appeal")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("reason")
          .setLabel("Why should this be reconsidered?")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000)
      )
    );
  await interaction.showModal(modal);
}

// Modal submit: creates the Appeal row and posts it to staff for review.
export async function handleAppealModalSubmit(interaction: ModalSubmitInteraction, caseId: string) {
  const reason = interaction.fields.getTextInputValue("reason");

  // This modal is submitted from a DM (the appeal button lives on a DM the
  // bot sent), so there's no interaction.guildId to fall back on — the
  // guild is derived from the case being appealed instead.
  const originalCase = await prisma.moderationCase.findUnique({ where: { id: caseId } });
  if (!originalCase) {
    await interaction.reply({ content: "That case no longer exists — this appeal can't be submitted.", ephemeral: true });
    return;
  }
  const guildId = originalCase.guildId;
  const settings = await prisma.appealSettings.findUnique({ where: { guildId } });

  const appeal = await prisma.appeal.create({
    data: {
      guildId,
      userId: interaction.user.id,
      caseId,
      reason,
      status: "PENDING",
    },
  });

  if (!settings?.appealChannelId) {
    await interaction.reply({ content: "Your appeal was recorded, but this server hasn't configured a review channel yet.", ephemeral: true });
    return;
  }

  const channel = await interaction.client.channels.fetch(settings.appealChannelId).catch(() => null);
  if (!isSendableChannel(channel)) {
    await interaction.reply({ content: "Your appeal was recorded, but the review channel is no longer available.", ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xffc857)
    .setTitle("New Appeal")
    .setDescription(reason)
    .addFields(
      { name: "User", value: `<@${interaction.user.id}> (${interaction.user.id})`, inline: true },
      { name: "Original action", value: originalCase?.action ?? "Unknown", inline: true }
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`appeal:approve:${appeal.id}`).setLabel("Approve").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`appeal:deny:${appeal.id}`).setLabel("Deny").setStyle(ButtonStyle.Danger)
  );

  const message = await channel.send({ embeds: [embed], components: [row] }).catch(() => null);
  if (message) {
    await prisma.appeal.update({ where: { id: appeal.id }, data: { messageId: message.id } });
  }

  await interaction.reply({ content: "✅ Your appeal has been submitted for review.", ephemeral: true });
}

// Staff review action — requires ModerateMembers, same guard used elsewhere
// for moderation-adjacent button handlers.
export async function handleAppealResolve(interaction: ButtonInteraction, appealId: string, decision: "approve" | "deny") {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
    await interaction.reply({ content: "You don't have permission to resolve appeals.", ephemeral: true });
    return;
  }

  const appeal = await prisma.appeal.findUnique({ where: { id: appealId } });
  if (!appeal) {
    await interaction.reply({ content: "This appeal no longer exists.", ephemeral: true });
    return;
  }
  if (appeal.status !== "PENDING") {
    await interaction.reply({ content: `This appeal was already ${appeal.status.toLowerCase()}.`, ephemeral: true });
    return;
  }

  const status = decision === "approve" ? "APPROVED" : "DENIED";
  await prisma.appeal.update({
    where: { id: appealId },
    data: { status, resolvedBy: interaction.user.id, resolvedAt: new Date() },
  });

  if (decision === "approve" && interaction.guild) {
    const originalCase = appeal.caseId ? await prisma.moderationCase.findUnique({ where: { id: appeal.caseId } }) : null;

    if (originalCase?.action === "BAN") {
      await interaction.guild.members.unban(appeal.userId, "Appeal approved").catch(() => null);
      await logCase({
        guildId: appeal.guildId,
        userId: appeal.userId,
        action: "UNBAN",
        reason: "Appeal approved",
        moderatorId: interaction.user.id,
        client: interaction.client,
      });
    } else if (originalCase?.action === "MUTE") {
      const member = await interaction.guild.members.fetch(appeal.userId).catch(() => null);
      await member?.timeout(null, "Appeal approved").catch(() => null);
      await logCase({
        guildId: appeal.guildId,
        userId: appeal.userId,
        action: "UNMUTE",
        reason: "Appeal approved",
        moderatorId: interaction.user.id,
        client: interaction.client,
      });
    }
  }

  const original = interaction.message;
  const originalEmbed = original.embeds[0];
  const updatedEmbed = originalEmbed
    ? EmbedBuilder.from(originalEmbed)
        .setColor(decision === "approve" ? 0x2ecc71 : 0xe74c3c)
        .addFields({ name: "Resolution", value: `${status} by <@${interaction.user.id}>` })
    : new EmbedBuilder().setDescription(`${status} by <@${interaction.user.id}>`);

  await interaction.update({ embeds: [updatedEmbed], components: [] }).catch(() => null);
}
