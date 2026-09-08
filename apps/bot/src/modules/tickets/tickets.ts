import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
} from "discord.js";
import { prisma } from "../../lib/prisma";

function controlRow(ticketId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ticket:${ticketId}:claim`).setLabel("Claim").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ticket:${ticketId}:close`).setLabel("Close").setStyle(ButtonStyle.Danger)
  );
}

export async function handleOpenTicket(interaction: ButtonInteraction, panelId: string) {
  if (!interaction.guild) return;

  const panel = await prisma.ticketPanel.findUnique({ where: { id: panelId } });
  if (!panel) {
    await interaction.reply({ content: "This ticket panel no longer exists.", ephemeral: true });
    return;
  }

  const overwrites = [
    { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
  ];
  if (panel.supportRoleId) {
    overwrites.push({ id: panel.supportRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
  }

  const channel = await interaction.guild.channels.create({
    name: `ticket-${interaction.user.username}`.toLowerCase().slice(0, 90),
    type: ChannelType.GuildText,
    parent: panel.categoryId ?? undefined,
    permissionOverwrites: overwrites,
  });

  const ticket = await prisma.ticket.create({
    data: { guildId: interaction.guild.id, panelId, channelId: channel.id, userId: interaction.user.id },
  });

  await channel.send({
    content: `${panel.supportRoleId ? `<@&${panel.supportRoleId}> ` : ""}<@${interaction.user.id}> — thanks for opening a ticket. Describe your issue and a staff member will be with you shortly.`,
    components: [controlRow(ticket.id)],
  });

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

  await prisma.ticket.update({ where: { id: ticketId }, data: { status: "CLOSED", closedAt: new Date() } });
  await interaction.reply("🔒 Closing this ticket in 5 seconds…");
  setTimeout(() => interaction.channel?.delete().catch(() => null), 5000);
}
