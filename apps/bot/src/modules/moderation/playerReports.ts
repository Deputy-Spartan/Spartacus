import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, EmbedBuilder, GuildMember, Message, PermissionFlagsBits } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isSendableChannel } from "../../lib/channels";
import type { PlayerReport, PlayerReportSettings } from "@prisma/client";
import type { Prisma } from "@prisma/client";

interface TranscriptEntry {
  authorId: string;
  authorTag: string;
  content: string;
  attachmentUrls: string[];
  at: string;
}

const STATUS_COLOR: Record<string, number> = { OPEN: 0xe74c3c, REVIEWING: 0xffc857, RESOLVED: 0x2ecc71 };

function controlRow(reportId: string, status: string) {
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (status !== "RESOLVED") {
    row.addComponents(new ButtonBuilder().setCustomId(`report:claim:${reportId}`).setLabel("Claim").setStyle(ButtonStyle.Primary));
    row.addComponents(new ButtonBuilder().setCustomId(`report:close:${reportId}`).setLabel("Close").setStyle(ButtonStyle.Danger));
  }
  return row;
}

function buildEmbed(report: PlayerReport) {
  return new EmbedBuilder()
    .setColor(STATUS_COLOR[report.status] ?? 0x5865f2)
    .setTitle(`🚩 Player Report — ${report.status}`)
    .addFields(
      { name: "Reported", value: `<@${report.reportedUserId}>`, inline: true },
      { name: "Reporter", value: `<@${report.reporterId}>`, inline: true },
      { name: "Reason", value: report.reason.slice(0, 1024) },
      ...(report.claimedById ? [{ name: "Claimed by", value: `<@${report.claimedById}>`, inline: true }] : []),
      ...(report.closedAt ? [{ name: "Closed", value: `<t:${Math.floor(report.closedAt.getTime() / 1000)}:R>`, inline: true }] : [])
    )
    .setFooter({ text: `Report ID: ${report.id}` })
    .setTimestamp();
}

async function canReview(member: GuildMember | null, settings: PlayerReportSettings | null): Promise<boolean> {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  if (settings?.staffRoleId && member.roles.cache.has(settings.staffRoleId)) return true;
  return false;
}

// Posts the review embed and opens a discussion thread on it — called right
// after /report creates the row. Staff reply directly in that thread; every
// message there gets appended to the report's transcript live (see
// events/messageCreate.ts) so the dashboard has a durable record even after
// the thread is archived.
export async function postReportForReview(client: Message["client"], reportId: string) {
  const report = await prisma.playerReport.findUnique({ where: { id: reportId } });
  if (!report) return;

  const settings = await prisma.playerReportSettings.findUnique({ where: { guildId: report.guildId } });
  if (!settings?.reviewChannelId) return;

  const channel = await client.channels.fetch(settings.reviewChannelId).catch(() => null);
  if (!isSendableChannel(channel)) return;

  const message = await channel
    .send({
      content: settings.staffRoleId ? `<@&${settings.staffRoleId}>` : undefined,
      embeds: [buildEmbed(report)],
      components: [controlRow(report.id, report.status)],
    })
    .catch(() => null);
  if (!message) return;

  const thread = await message.startThread({ name: `Report ${report.id.slice(0, 8)}`, autoArchiveDuration: 10080 }).catch(() => null);

  await prisma.playerReport.update({ where: { id: report.id }, data: { messageId: message.id, channelId: thread?.id ?? null } });
}

async function refreshMessage(client: Message["client"], report: PlayerReport, settings: PlayerReportSettings | null) {
  if (!settings?.reviewChannelId || !report.messageId) return;
  const channel = await client.channels.fetch(settings.reviewChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const message = await channel.messages.fetch(report.messageId).catch(() => null);
  await message?.edit({ embeds: [buildEmbed(report)], components: [controlRow(report.id, report.status)] }).catch(() => null);
}

export async function handleReportClaim(interaction: ButtonInteraction, reportId: string) {
  const report = await prisma.playerReport.findUnique({ where: { id: reportId } });
  if (!report) {
    await interaction.reply({ content: "This report no longer exists.", ephemeral: true });
    return;
  }

  const settings = interaction.guildId ? await prisma.playerReportSettings.findUnique({ where: { guildId: interaction.guildId } }) : null;
  if (!(await canReview(interaction.member as GuildMember | null, settings))) {
    await interaction.reply({ content: "You don't have the staff role needed to review reports.", ephemeral: true });
    return;
  }
  if (report.status === "RESOLVED") {
    await interaction.reply({ content: "This report is already closed.", ephemeral: true });
    return;
  }
  if (report.claimedById) {
    await interaction.reply({ content: `Already claimed by <@${report.claimedById}>.`, ephemeral: true });
    return;
  }

  const updated = await prisma.playerReport.update({
    where: { id: reportId },
    data: { status: "REVIEWING", claimedById: interaction.user.id },
  });

  await refreshMessage(interaction.client, updated, settings);
  await interaction.reply({ content: `🙋 Claimed by <@${interaction.user.id}>.` });
}

export async function handleReportClose(interaction: ButtonInteraction, reportId: string) {
  const report = await prisma.playerReport.findUnique({ where: { id: reportId } });
  if (!report) {
    await interaction.reply({ content: "This report no longer exists.", ephemeral: true });
    return;
  }

  const settings = interaction.guildId ? await prisma.playerReportSettings.findUnique({ where: { guildId: interaction.guildId } }) : null;
  if (!(await canReview(interaction.member as GuildMember | null, settings))) {
    await interaction.reply({ content: "You don't have the staff role needed to review reports.", ephemeral: true });
    return;
  }
  if (report.status === "RESOLVED") {
    await interaction.reply({ content: "This report is already closed.", ephemeral: true });
    return;
  }

  const updated = await prisma.playerReport.update({
    where: { id: reportId },
    data: { status: "RESOLVED", closedAt: new Date(), claimedById: report.claimedById ?? interaction.user.id },
  });

  await refreshMessage(interaction.client, updated, settings);

  if (report.channelId) {
    const thread = await interaction.client.channels.fetch(report.channelId).catch(() => null);
    if (thread?.isThread()) {
      await thread.send(`🔒 Report closed by <@${interaction.user.id}>.`).catch(() => null);
      await thread.setArchived(true).catch(() => null);
      await thread.setLocked(true).catch(() => null);
    }
  }

  await interaction.reply({ content: `🔒 Report closed by <@${interaction.user.id}>.` });
}

// Called from events/messageCreate.ts for every message posted in a report's
// discussion thread — keeps a durable copy of the conversation (the thread
// itself can be archived/deleted) that the dashboard reads as the transcript.
export async function appendReportTranscript(channelId: string, message: Message) {
  const report = await prisma.playerReport.findUnique({ where: { channelId } });
  if (!report) return;

  const transcript = Array.isArray(report.transcript) ? (report.transcript as unknown as TranscriptEntry[]) : [];
  transcript.push({
    authorId: message.author.id,
    authorTag: message.author.tag,
    content: message.content || (message.attachments.size > 0 ? "(attachment only)" : ""),
    attachmentUrls: [...message.attachments.values()].map((a) => a.url),
    at: new Date().toISOString(),
  });

  await prisma.playerReport
    .update({ where: { id: report.id }, data: { transcript: transcript as unknown as Prisma.InputJsonValue } })
    .catch(() => null);
}
