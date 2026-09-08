import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { prisma } from "../../lib/prisma";
import type { CommandModule } from "../types";

const NEON_BLUE = 0x00e5ff;

function buildSignupEmbed(title: string, description: string | null, startTime: Date) {
  return new EmbedBuilder()
    .setColor(NEON_BLUE)
    .setTitle(`⚔️ ${title}`)
    .setDescription(description ?? "No description provided.")
    .addFields(
      { name: "🕒 Starts", value: `<t:${Math.floor(startTime.getTime() / 1000)}:F>`, inline: true },
      { name: "🛡️ Tank", value: "—", inline: true },
      { name: "⚔️ DPS", value: "—", inline: true },
      { name: "✨ Healer", value: "—", inline: true },
      { name: "✅ Attending", value: "—", inline: true },
      { name: "❌ Absent", value: "—", inline: true }
    )
    .setFooter({ text: "Spartacus Event Coordination" });
}

function buildSignupRow(eventId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`event:${eventId}:TANK`).setLabel("Tank").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`event:${eventId}:DPS`).setLabel("DPS").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`event:${eventId}:HEALER`).setLabel("Healer").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`event:${eventId}:ATTENDING`).setLabel("Attending").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`event:${eventId}:ABSENT`).setLabel("Absent").setStyle(ButtonStyle.Secondary)
  );
}

const command: CommandModule = {
  moduleKey: "EVENTS",
  data: new SlashCommandBuilder()
    .setName("create-event")
    .setDescription("Create a raid/event signup sheet")
    .addStringOption((o) => o.setName("title").setDescription("Event title").setRequired(true))
    .addStringOption((o) =>
      o.setName("start").setDescription("Start time (ISO 8601, e.g. 2026-09-10T20:00:00)").setRequired(true)
    )
    .addChannelOption((o) =>
      o
        .setName("channel")
        .setDescription("Channel to post the signup sheet in")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addStringOption((o) => o.setName("description").setDescription("Event description"))
    .addIntegerOption((o) =>
      o.setName("reminder_minutes").setDescription("Minutes before start to send reminders (default 15)")
    ) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.guildId) return;

    const title = interaction.options.getString("title", true);
    const startRaw = interaction.options.getString("start", true);
    const description = interaction.options.getString("description");
    const channel = interaction.options.getChannel("channel", true);
    const reminderMinutes = interaction.options.getInteger("reminder_minutes") ?? 15;

    const startTime = new Date(startRaw);
    if (Number.isNaN(startTime.getTime())) {
      await interaction.reply({ content: "That start time isn't a valid date.", ephemeral: true });
      return;
    }

    const event = await prisma.event.create({
      data: {
        guildId: interaction.guildId,
        title,
        description,
        channelId: channel.id,
        startTime,
        reminderMinutesBefore: reminderMinutes,
        createdById: interaction.user.id,
      },
    });

    const targetChannel = await interaction.guild?.channels.fetch(channel.id);
    if (!targetChannel?.isTextBased()) {
      await interaction.reply({ content: "That channel isn't a text channel.", ephemeral: true });
      return;
    }

    const message = await targetChannel.send({
      embeds: [buildSignupEmbed(title, description, startTime)],
      components: [buildSignupRow(event.id)],
    });

    await prisma.event.update({ where: { id: event.id }, data: { messageId: message.id } });

    await interaction.reply({ content: `✅ Event created in <#${channel.id}>.`, ephemeral: true });
  },
};

export default command;
