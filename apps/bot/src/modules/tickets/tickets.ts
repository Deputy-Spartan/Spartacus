import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { prisma } from "../../lib/prisma";
import type { TicketPanel, TicketSettings, TicketType } from "@spartacus/db";

// Discord channel names are lowercase-and-dashes only, so tokens get
// substituted before that normalization runs.
function buildChannelName(format: string | undefined, tokens: { user: string; number: string; type: string }) {
  const name = (format || "ticket-{user}")
    .replace(/{user}/g, tokens.user)
    .replace(/{number}|{count}/g, tokens.number)
    .replace(/{type}/g, tokens.type);
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 90) || `ticket-${tokens.number}`;
}

function controlRow(ticketId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ticket:${ticketId}:claim`).setLabel("Claim").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ticket:${ticketId}:close`).setLabel("Close").setStyle(ButtonStyle.Danger)
  );
}

async function getSettings(guildId: string): Promise<TicketSettings | null> {
  return prisma.ticketSettings.findUnique({ where: { guildId } });
}

async function isBlocked(guildId: string, userId: string, memberRoleIds: string[], settings: TicketSettings | null) {
  if (!settings) return false;
  const blacklistUsers = Array.isArray(settings.blacklistUserIds) ? (settings.blacklistUserIds as string[]) : [];
  if (blacklistUsers.includes(userId)) return true;
  const blacklistRoles = Array.isArray(settings.blacklistRoleIds) ? (settings.blacklistRoleIds as string[]) : [];
  return memberRoleIds.some((r) => blacklistRoles.includes(r));
}

export async function handleOpenTicket(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  panelId: string,
  typeId?: string
) {
  if (!interaction.guild) return;

  const panel = await prisma.ticketPanel.findUnique({ where: { id: panelId } });
  if (!panel || panel.paused) {
    await interaction.reply({ content: "This ticket panel isn't accepting tickets right now.", ephemeral: true });
    return;
  }

  const type = typeId ? await prisma.ticketType.findUnique({ where: { id: typeId } }) : null;
  const settings = await getSettings(interaction.guild.id);

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const memberRoleIds = member ? [...member.roles.cache.keys()] : [];
  if (await isBlocked(interaction.guild.id, interaction.user.id, memberRoleIds, settings)) {
    await interaction.reply({ content: "You're not able to open tickets in this server.", ephemeral: true });
    return;
  }

  const cap = settings?.ticketCap ?? 0;
  if (cap > 0) {
    const openCount = await prisma.ticket.count({
      where: { guildId: interaction.guild.id, userId: interaction.user.id, status: { in: ["OPEN", "CLAIMED"] } },
    });
    if (openCount >= cap) {
      await interaction.reply({ content: `You already have ${openCount} open ticket(s) — close one before opening another.`, ephemeral: true });
      return;
    }
  }

  const categoryId = type?.categoryId ?? panel.categoryId ?? undefined;
  const staffRoleIds: string[] = type && Array.isArray(type.staffRoleIds) ? (type.staffRoleIds as string[]) : [];
  const supportRoleId = panel.supportRoleId;

  const overwrites = [
    { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
  ];
  for (const roleId of staffRoleIds) overwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
  if (supportRoleId && !staffRoleIds.includes(supportRoleId)) {
    overwrites.push({ id: supportRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
  }
  const supportSettingsRoles = settings && Array.isArray(settings.supportRoleIds) ? (settings.supportRoleIds as string[]) : [];
  for (const roleId of supportSettingsRoles) {
    if (!overwrites.some((o) => o.id === roleId)) overwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
  }

  // Numbering is per-panel and atomic — an incrementing counter on the panel
  // itself rather than "max existing ticket + 1", so it can't race under
  // concurrent opens and survives tickets being deleted.
  const updatedPanel = await prisma.ticketPanel.update({
    where: { id: panelId },
    data: { ticketCounter: { increment: 1 } },
  });
  const ticketNumber = updatedPanel.ticketCounter;

  const channel = await interaction.guild.channels.create({
    name: buildChannelName(settings?.channelNameFormat, {
      user: interaction.user.username,
      number: String(ticketNumber),
      type: type?.name ?? "ticket",
    }),
    type: ChannelType.GuildText,
    parent: categoryId,
    permissionOverwrites: overwrites,
  });

  const ticket = await prisma.ticket.create({
    data: {
      guildId: interaction.guild.id,
      panelId,
      typeId: type?.id,
      ticketNumber,
      channelId: channel.id,
      userId: interaction.user.id,
    },
  });

  const pingRoles = [...new Set([...(supportRoleId ? [supportRoleId] : []), ...staffRoleIds])];
  const openMessage = type?.openMessage || "Thanks for opening a ticket. Describe your issue and a staff member will be with you shortly.";
  await channel.send({
    content: `${pingRoles.map((r) => `<@&${r}>`).join(" ")} <@${interaction.user.id}> — ${openMessage}`,
    components: [controlRow(ticket.id)],
  });

  if (settings?.logChannelId) {
    const logChannel = await interaction.guild.channels.fetch(settings.logChannelId).catch(() => null);
    if (logChannel?.isTextBased()) {
      await logChannel
        .send(`🎫 Ticket #${ticket.ticketNumber} opened by <@${interaction.user.id}> in <#${channel.id}>${type ? ` (${type.name})` : ""}`)
        .catch(() => null);
    }
  }

  await interaction.reply({ content: `✅ Ticket opened: <#${channel.id}>`, ephemeral: true });
}

export async function handleTicketControl(interaction: ButtonInteraction, ticketId: string, action: "claim" | "close") {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    await interaction.reply({ content: "This ticket no longer exists.", ephemeral: true });
    return;
  }

  if (action === "claim") {
    await prisma.ticket.update({ where: { id: ticketId }, data: { status: "CLAIMED", claimedById: interaction.user.id } });
    await interaction.reply(`🙋 Ticket claimed by <@${interaction.user.id}>.`);
    return;
  }

  const settings = interaction.guild ? await getSettings(interaction.guild.id) : null;
  if (settings?.requireCloseReason) {
    const modal = new ModalBuilder()
      .setCustomId(`ticketclose:${ticketId}`)
      .setTitle("Close ticket")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId("reason").setLabel("Close reason").setStyle(TextInputStyle.Paragraph).setRequired(true)
        )
      );
    await interaction.showModal(modal);
    return;
  }

  await closeTicket(interaction, ticketId, null);
}

export async function handleTicketCloseModal(interaction: ModalSubmitInteraction, ticketId: string) {
  const reason = interaction.fields.getTextInputValue("reason");
  await closeTicket(interaction, ticketId, reason);
}

async function closeTicket(interaction: ButtonInteraction | ModalSubmitInteraction, ticketId: string, closeReason: string | null) {
  const ticket = await prisma.ticket.update({
    where: { id: ticketId },
    data: { status: "CLOSED", closedAt: new Date(), closeReason: closeReason ?? undefined },
  });

  await interaction.reply("🔒 Closing this ticket in 5 seconds…");

  if (interaction.guild) {
    const settings = await getSettings(interaction.guild.id);
    if (settings?.transcriptChannelId) {
      const transcriptChannel = await interaction.guild.channels.fetch(settings.transcriptChannelId).catch(() => null);
      if (transcriptChannel?.isTextBased()) {
        const durationMin = Math.round((Date.now() - new Date(ticket.createdAt).getTime()) / 60000);
        await transcriptChannel
          .send(
            `📄 Ticket #${ticket.ticketNumber} closed by <@${interaction.user.id}>\n` +
              `Opened by: <@${ticket.userId}>${ticket.claimedById ? ` · Claimed by: <@${ticket.claimedById}>` : ""}\n` +
              `Duration: ${durationMin}m${closeReason ? `\nReason: ${closeReason}` : ""}`
          )
          .catch(() => null);
      }
    }
  }

  setTimeout(() => interaction.channel?.delete().catch(() => null), 5000);
}

export function findPanelType(panel: TicketPanel, types: TicketType[]) {
  const ids = Array.isArray(panel.typeIds) ? (panel.typeIds as string[]) : [];
  return types.filter((t) => ids.includes(t.id) && t.enabled);
}
