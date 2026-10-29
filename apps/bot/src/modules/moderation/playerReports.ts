import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Guild,
  GuildMember,
  Message,
  ModalBuilder,
  ModalSubmitInteraction,
  type OverwriteResolvable,
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

// Discord channel names are lowercase-and-dashes only, so tokens get
// substituted before that normalization runs. Mirrors modules/tickets/
// tickets.ts's buildChannelName — same idea, different token set.
function buildChannelName(format: string | undefined, tokens: { user: string; reported: string; number: string }) {
  const name = (format || "report-{number}")
    .replace(/{user}/g, tokens.user)
    .replace(/{reported}/g, tokens.reported)
    .replace(/{number}|{count}/g, tokens.number);
  return (
    name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 90) || `report-${tokens.number}`
  );
}

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
    .setTitle(`🚩 Player Report #${report.reportNumber ?? "?"} — ${report.status}`)
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
              "Having an issue with another member? Click below to report it privately to staff. A private ticket channel gets opened just for your report — only you and staff ever know it exists."
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
// requiring the member to know /report exists.
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

// Ticket-style report creation — shared by the panel modal below and
// /report (see commands/moderation/report.ts). Creates a brand-new private
// channel under the configured category, named from channelNameFormat and
// numbered via an atomic counter (same "increment on create" pattern as
// TicketPanel.ticketCounter in modules/tickets/tickets.ts), posts the
// Claim/Close control embed as its first message, and pings the staff role.
// The reporter is never added to the channel — everything they see comes
// back to them as a DM or an ephemeral reply, never channel access.
export async function createPlayerReport(
  client: Client,
  guild: Guild,
  reporterId: string,
  reportedUserId: string,
  reason: string
): Promise<{ ok: true; report: PlayerReport } | { ok: false; error: string }> {
  const settings = await prisma.playerReportSettings.findUnique({ where: { guildId: guild.id } });
  if (!settings?.categoryId) {
    return { ok: false, error: "Player Reports isn't fully set up yet — ask an admin to pick a category on the dashboard." };
  }

  const category = await guild.channels.fetch(settings.categoryId).catch(() => null);
  if (!category || category.type !== ChannelType.GuildCategory) {
    return { ok: false, error: "The configured report category no longer exists — ask an admin to re-pick one on the dashboard." };
  }

  const updatedSettings = await prisma.playerReportSettings.update({
    where: { id: settings.id },
    data: { reportCounter: { increment: 1 } },
  });
  const reportNumber = updatedSettings.reportCounter;

  const [reporterUser, reportedUser] = await Promise.all([
    client.users.fetch(reporterId).catch(() => null),
    client.users.fetch(reportedUserId).catch(() => null),
  ]);

  // Locked down tight: @everyone (reporter included) can't see the channel
  // at all — only the staff role (or, failing that, nobody but server
  // admins via their own Discord permissions) can.
  const overwrites: OverwriteResolvable[] = [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }];
  if (settings.staffRoleId) {
    overwrites.push({ id: settings.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
  }

  const channel = await guild.channels
    .create({
      name: buildChannelName(settings.channelNameFormat, {
        user: reporterUser?.username ?? "unknown",
        reported: reportedUser?.username ?? "unknown",
        number: String(reportNumber),
      }),
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: overwrites,
    })
    .catch((err) => {
      logError("bot", err, guild.id);
      return null;
    });

  if (!channel) {
    return { ok: false, error: "Couldn't create the report channel — check my Manage Channels permission and that the category isn't full." };
  }

  const report = await prisma.playerReport.create({
    data: { guildId: guild.id, reporterId, reportedUserId, reason, reportNumber, channelId: channel.id },
  });

  const message = await channel
    .send({
      content: settings.staffRoleId ? `<@&${settings.staffRoleId}>` : undefined,
      embeds: [buildEmbed(report)],
      components: [controlRow(report.id, report.status)],
    })
    .catch(() => null);
  if (message) {
    await prisma.playerReport.update({ where: { id: report.id }, data: { messageId: message.id } });
  }

  return { ok: true, report };
}

async function canReview(member: GuildMember | null, settings: PlayerReportSettings | null): Promise<boolean> {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  if (settings?.staffRoleId && member.roles.cache.has(settings.staffRoleId)) return true;
  return false;
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

  const result = await createPlayerReport(interaction.client, interaction.guild, interaction.user.id, targetId, reason);
  if (!result.ok) {
    await interaction.reply({ content: `⚠️ ${result.error}`, ephemeral: true });
    return;
  }

  await interaction.reply({
    content: `✅ Report submitted privately (#${result.report.reportNumber}). Staff will review it — check your DMs for updates.`,
    ephemeral: true,
  });

  await interaction.user
    .send(
      `🚩 Your report in **${interaction.guild.name}** has been created (#${result.report.reportNumber}). Staff can now see it — you'll get another DM here once it's claimed. This is private; nobody else can see that you filed it.`
    )
    .catch(() => null); // DMs off — the ephemeral reply above already confirmed it either way.
}

async function refreshMessage(client: Client, report: PlayerReport) {
  if (!report.channelId || !report.messageId) return;
  const channel = await client.channels.fetch(report.channelId).catch(() => null);
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

  await refreshMessage(interaction.client, updated);
  await interaction.reply({ content: `🙋 Claimed by <@${interaction.user.id}>.` });

  const reporter = await interaction.client.users.fetch(report.reporterId).catch(() => null);
  await reporter
    ?.send(`🙋 Your report #${report.reportNumber} in **${interaction.guild?.name ?? "the server"}** has been claimed by a staff member and is now being reviewed.`)
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

  await refreshMessage(interaction.client, updated);
  await interaction.reply({ content: `🔒 Report closed by <@${interaction.user.id}>.` });

  // Lock the channel instead of deleting it — the transcript and embed stay
  // readable to staff as a record, nobody can post in it anymore.
  if (updated.channelId && settings?.staffRoleId) {
    const channel = await interaction.client.channels.fetch(updated.channelId).catch(() => null);
    if (channel && "permissionOverwrites" in channel) {
      await channel.permissionOverwrites.edit(settings.staffRoleId, { SendMessages: false }).catch(() => null);
    }
  }
}

// Called from events/messageCreate.ts for every message posted while
// PLAYER_REPORTS is enabled — keeps a durable copy of the conversation in
// each report's own channel (which may later be locked, though not
// deleted) that the dashboard reads as the transcript. No-ops instantly for
// any channel that isn't a report channel.
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
