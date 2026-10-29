import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  EmbedBuilder,
  GuildMember,
  Message,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { prisma } from "../../lib/prisma";
import { logError } from "@spartacus/db";
import { isSendableChannel } from "../../lib/channels";
import { isModuleEnabled } from "../../lib/moduleGate";
import { resolveSavedEmbed, buildSavedEmbedPayload } from "../../lib/savedEmbedRender";
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

function reportPanelRow() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("playerreport:open").setLabel("🚩 Report a Player").setStyle(ButtonStyle.Danger)
  );
}

// Posts (or reposts after a channel/embed change) the "Report a Player"
// panel — shared by the catch-up cron (jobs/playerReportPoster.ts) and the
// dashboard's immediate "Save" trigger. Mirrors postVerificationPanel /
// postRulesGatePanel exactly.
export async function postPlayerReportPanel(client: Client, settings: PlayerReportSettings): Promise<boolean> {
  if (!settings.panelChannelId) return false;
  const enabled = await isModuleEnabled(settings.guildId, "PLAYER_REPORTS");
  if (!enabled) return false;

  const channel = await client.channels.fetch(settings.panelChannelId).catch(() => null);
  if (!isSendableChannel(channel)) return false;

  const saved = await resolveSavedEmbed(settings.savedEmbedId);
  const payload = saved
    ? await buildSavedEmbedPayload(settings.guildId, saved)
    : {
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("🚩 Report a Player")
            .setDescription(
              "Having an issue with another member? Click below to report it privately to staff. Only you and the reviewing staff member will ever see what you submit."
            ),
        ],
      };

  const message = await channel
    .send({ ...payload, components: [...(payload.components ?? []), reportPanelRow()] })
    .catch((err) => {
      logError("bot", err, settings.guildId);
      return null;
    });
  if (!message) return false;

  await prisma.playerReportSettings.update({ where: { id: settings.id }, data: { panelMessageId: message.id } });
  return true;
}

// Panel button click — opens a modal asking who and why, instead of
// requiring the member to know /report exists. Nothing about this report
// is visible to anyone but the member and whoever can see the (staff-only,
// permission-locked) review channel: the modal reply and both DMs below are
// always private/ephemeral.
export async function handlePlayerReportPanelButton(interaction: ButtonInteraction) {
  const modal = new ModalBuilder()
    .setCustomId("playerreportmodal")
    .setTitle("Report a Player")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("target")
          .setLabel("Who are you reporting? (@mention or user ID)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("reason")
          .setLabel("What happened?")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000)
      )
    );
  await interaction.showModal(modal);
}

export async function handlePlayerReportModalSubmit(interaction: ModalSubmitInteraction) {
  if (!interaction.guildId || !interaction.guild) return;

  const rawTarget = interaction.fields.getTextInputValue("target").trim();
  const reason = interaction.fields.getTextInputValue("reason").trim();
  const targetId = rawTarget.replace(/[<@!>]/g, "");

  if (!/^\d{15,25}$/.test(targetId)) {
    await interaction.reply({ content: "⚠️ That doesn't look like a valid @mention or user ID. Try again from the panel button.", ephemeral: true });
    return;
  }
  if (targetId === interaction.user.id) {
    await interaction.reply({ content: "⚠️ You can't report yourself.", ephemeral: true });
    return;
  }

  const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
  if (!targetMember) {
    await interaction.reply({ content: "⚠️ Couldn't find that member in this server — double check the mention or ID.", ephemeral: true });
    return;
  }
  if (targetMember.user.bot) {
    await interaction.reply({ content: "⚠️ You can't report a bot.", ephemeral: true });
    return;
  }

  const report = await prisma.playerReport.create({
    data: {
      guildId: interaction.guildId,
      reporterId: interaction.user.id,
      reportedUserId: targetId,
      reason,
    },
  });

  await interaction.reply({
    content: `✅ Report submitted privately (#${report.id.slice(0, 8)}). Staff will review it — check your DMs for updates.`,
    ephemeral: true,
  });

  await postReportForReview(interaction.client, report.id);

  await interaction.user
    .send(
      `🚩 Your report in **${interaction.guild.name}** has been created (#${report.id.slice(0, 8)}). Staff can now see it — you'll get another DM here once it's claimed. This is private; nobody else can see that you filed it.`
    )
    .catch(() => null); // DMs off — the ephemeral reply above already confirmed it either way.
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

  const reporter = await interaction.client.users.fetch(report.reporterId).catch(() => null);
  await reporter
    ?.send(`🙋 Your report #${report.id.slice(0, 8)} in **${interaction.guild?.name ?? "the server"}** has been claimed by a staff member and is now being reviewed.`)
    .catch(() => null);
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
