import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { prisma } from "../../lib/prisma";
import { buildEventPayload } from "../../lib/eventRender";
import { isSendableChannel } from "../../lib/channels";
import type { CommandModule } from "../types";

const ALL_ROLES = ["TANK", "DPS", "HEALER", "ATTENDING", "ABSENT"];

async function findEventByTitle(guildId: string, title: string) {
  const matches = await prisma.event.findMany({
    where: { guildId, title: { contains: title, mode: "insensitive" } },
    orderBy: { startTime: "asc" },
  });
  return matches;
}

const command: CommandModule = {
  moduleKey: "EVENTS",
  data: new SlashCommandBuilder()
    .setName("event")
    .setDescription("Manage scheduled events for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("create")
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
        .addIntegerOption((o) => o.setName("reminder_minutes").setDescription("Minutes before start to send reminders (default 15)"))
    )
    .addSubcommand((sub) =>
      sub
        .setName("edit")
        .setDescription("Edit an existing event (matches by title)")
        .addStringOption((o) => o.setName("title").setDescription("Current title, or part of it, to find the event").setRequired(true))
        .addStringOption((o) => o.setName("new_title").setDescription("New title"))
        .addStringOption((o) => o.setName("new_description").setDescription("New description"))
        .addStringOption((o) => o.setName("new_start").setDescription("New start time (ISO 8601)"))
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove an event (matches by title)")
        .addStringOption((o) => o.setName("title").setDescription("Title, or part of it, to find the event").setRequired(true))
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("See how many events are scheduled and where")) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.guildId) return;
    const sub = interaction.options.getSubcommand();

    if (sub === "create") {
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

      const targetChannel = await interaction.guild?.channels.fetch(channel.id);
      if (!targetChannel?.isTextBased()) {
        await interaction.reply({ content: "That channel isn't a text channel.", ephemeral: true });
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
          enabledRoles: ALL_ROLES,
          createdById: interaction.user.id,
        },
      });

      const message = await targetChannel.send(buildEventPayload(event));
      await prisma.event.update({ where: { id: event.id }, data: { messageId: message.id, needsSync: false } });

      await interaction.reply({ content: `✅ Event created in <#${channel.id}>.`, ephemeral: true });
      return;
    }

    if (sub === "edit") {
      const title = interaction.options.getString("title", true);
      const matches = await findEventByTitle(interaction.guildId, title);

      if (matches.length === 0) {
        await interaction.reply({ content: `No event found matching "${title}".`, ephemeral: true });
        return;
      }
      if (matches.length > 1) {
        const lines = matches.map((e) => `• **${e.title}** in <#${e.channelId}>`).join("\n");
        await interaction.reply({ content: `Multiple events match "${title}" — be more specific:\n${lines}`, ephemeral: true });
        return;
      }

      const newTitle = interaction.options.getString("new_title");
      const newDescription = interaction.options.getString("new_description");
      const newStartRaw = interaction.options.getString("new_start");
      const newStart = newStartRaw ? new Date(newStartRaw) : undefined;
      if (newStart && Number.isNaN(newStart.getTime())) {
        await interaction.reply({ content: "That start time isn't a valid date.", ephemeral: true });
        return;
      }

      await prisma.event.update({
        where: { id: matches[0].id },
        data: {
          title: newTitle ?? undefined,
          description: newDescription ?? undefined,
          startTime: newStart,
          needsSync: true, // the sync job (~every 15s) edits the live Discord message
        },
      });

      await interaction.reply({ content: `✏️ Updated **${matches[0].title}** — changes appear in Discord within ~15 seconds.`, ephemeral: true });
      return;
    }

    if (sub === "remove") {
      const title = interaction.options.getString("title", true);
      const matches = await findEventByTitle(interaction.guildId, title);

      if (matches.length === 0) {
        await interaction.reply({ content: `No event found matching "${title}".`, ephemeral: true });
        return;
      }
      if (matches.length > 1) {
        const lines = matches.map((e) => `• **${e.title}** in <#${e.channelId}>`).join("\n");
        await interaction.reply({ content: `Multiple events match "${title}" — be more specific:\n${lines}`, ephemeral: true });
        return;
      }

      const event = matches[0];
      if (event.messageId) {
        const channel = await interaction.guild?.channels.fetch(event.channelId).catch(() => null);
        if (channel && isSendableChannel(channel)) {
          const message = await channel.messages.fetch(event.messageId).catch(() => null);
          await message?.delete().catch(() => null);
        }
      }
      await prisma.event.delete({ where: { id: event.id } });

      await interaction.reply({ content: `🗑️ Removed **${event.title}**.`, ephemeral: true });
      return;
    }

    if (sub === "list") {
      const events = await prisma.event.findMany({ where: { guildId: interaction.guildId }, orderBy: { startTime: "asc" } });
      if (events.length === 0) {
        await interaction.reply({ content: "No events are scheduled in this server.", ephemeral: true });
        return;
      }

      const now = Date.now();
      const lines = events.map((e) => {
        const when = new Date(e.startTime).getTime() < now ? "past" : `<t:${Math.floor(new Date(e.startTime).getTime() / 1000)}:R>`;
        return `• **${e.title}** in <#${e.channelId}> — ${when}`;
      });

      await interaction.reply({ content: `📋 ${events.length} event(s) scheduled:\n${lines.join("\n")}`, ephemeral: true });
    }
  },
};

export default command;
