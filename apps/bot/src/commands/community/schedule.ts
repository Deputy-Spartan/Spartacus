import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { DAY_NAMES, formatTimeOfDay, parseDay, parseTimeOfDay } from "@spartacus/shared";
import { prisma } from "../../lib/prisma";
import { removeSlot, scheduleEmbed, updateSchedule } from "../../modules/stream/schedule";
import type { CommandModule } from "../types";

const MAX_SLOTS = 60;
const MAX_PER_PERSON = 14;

// /schedule: the weekly stream schedule. Anyone can look; staff and streamers
// (linked on the dashboard, or holding the streamer role) can add their own.
const command: CommandModule = {
  moduleKey: "STREAM_EXTRAS",
  data: new SlashCommandBuilder()
    .setName("schedule")
    .setDescription("The weekly stream schedule")
    .setDMPermission(false)
    .addSubcommand((s) => s.setName("view").setDescription("See the schedule"))
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Add a weekly stream to the schedule")
        .addStringOption((o) => o.setName("day").setDescription("Day of the week, e.g. Friday").setRequired(true))
        .addStringOption((o) => o.setName("time").setDescription("Start time in the server's time zone, e.g. 7pm or 19:30").setRequired(true))
        .addStringOption((o) => o.setName("title").setDescription("What you'll be playing").setMaxLength(80))
        .addIntegerOption((o) => o.setName("hours").setDescription("How long, in hours (default 2)").setMinValue(1).setMaxValue(12))
        .addStringOption((o) => o.setName("link").setDescription("Where to watch (a link)").setMaxLength(200))
        .addStringOption((o) => o.setName("name").setDescription("Name to show (default: your server name)").setMaxLength(60)),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Remove one of your streams from the schedule")
        .addStringOption((o) => o.setName("day").setDescription("Day of the week").setRequired(true))
        .addStringOption((o) => o.setName("time").setDescription("Its start time").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("channel")
        .setDescription("Post the schedule in a channel and keep it updated (staff)")
        .addChannelOption((o) => o.setName("channel").setDescription("Where the schedule goes").setRequired(true)),
    ) as SlashCommandBuilder,

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) return;
    const sub = interaction.options.getSubcommand();
    const config = await prisma.streamExtrasConfig.findUnique({ where: { guildId: guild.id } });
    const tz = config?.scheduleTimezone ?? "UTC";

    if (sub === "view") {
      const slots = await prisma.streamSlot.findMany({ where: { guildId: guild.id } });
      await interaction.reply({ embeds: [scheduleEmbed({ scheduleTimezone: tz }, slots)], ephemeral: true });
      return;
    }

    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) return;
    const staff = member.permissions.has(PermissionFlagsBits.ManageGuild);

    if (sub === "channel") {
      if (!staff) {
        await interaction.reply({ content: "You need Manage Server to do that.", ephemeral: true });
        return;
      }
      const channel = interaction.options.getChannel("channel", true);
      await interaction.deferReply({ ephemeral: true });
      await prisma.streamExtrasConfig.upsert({
        where: { guildId: guild.id },
        create: { guildId: guild.id, scheduleChannelId: channel.id, scheduleMessageId: null },
        update: { scheduleChannelId: channel.id, scheduleMessageId: null, scheduleHash: null },
      });
      const r = await updateSchedule(interaction.client, guild.id, true);
      await interaction.editReply(r.message.ok ? `📅 The schedule is posted in <#${channel.id}> and will keep itself up to date.` : `⚠️ ${r.message.error}`);
      return;
    }

    // add / remove: staff, linked streamers, or members with the streamer role.
    const settings = await prisma.streamAlertSettings.findUnique({ where: { guildId: guild.id } });
    const linked = await prisma.streamSubscription.count({ where: { guildId: guild.id, discordUserId: member.id } });
    const allowed = staff || linked > 0 || (settings?.selfServeRoleId ? member.roles.cache.has(settings.selfServeRoleId) : false);
    if (!allowed) {
      await interaction.reply({ content: "Only streamers (or staff) can change the schedule.", ephemeral: true });
      return;
    }
    const day = parseDay(interaction.options.getString("day", true));
    const start = parseTimeOfDay(interaction.options.getString("time", true));
    if (day === null || start === null) {
      await interaction.reply({ content: "I couldn't read that day or time. Try a day like `Friday` and a time like `7pm` or `19:30`.", ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });

    if (sub === "remove") {
      const mine = await prisma.streamSlot.findMany({ where: { guildId: guild.id, dayOfWeek: day, startMinutes: start, ...(staff ? {} : { userId: member.id }) } });
      if (!mine.length) {
        await interaction.editReply(`I couldn't find ${staff ? "a" : "one of your"} stream on ${DAY_NAMES[day]} at ${formatTimeOfDay(start)}.`);
        return;
      }
      for (const s of mine) await removeSlot(interaction.client, s.id);
      await updateSchedule(interaction.client, guild.id, true);
      await interaction.editReply(`🗑️ Removed ${mine.length === 1 ? "it" : `${mine.length} streams`} from the schedule.`);
      return;
    }

    const [total, own] = await Promise.all([
      prisma.streamSlot.count({ where: { guildId: guild.id } }),
      prisma.streamSlot.count({ where: { guildId: guild.id, userId: member.id } }),
    ]);
    if (total >= MAX_SLOTS || (!staff && own >= MAX_PER_PERSON)) {
      await interaction.editReply(total >= MAX_SLOTS ? "The schedule is full." : `You can have up to ${MAX_PER_PERSON} streams on the schedule.`);
      return;
    }
    const link = interaction.options.getString("link");
    if (link && !/^https?:\/\//i.test(link)) {
      await interaction.editReply("The link has to start with https://");
      return;
    }
    await prisma.streamSlot.create({
      data: {
        guildId: guild.id,
        userId: member.id,
        streamer: interaction.options.getString("name") || member.displayName,
        title: interaction.options.getString("title"),
        link,
        dayOfWeek: day,
        startMinutes: start,
        durationMin: (interaction.options.getInteger("hours") ?? 2) * 60,
      },
    });
    const r = await updateSchedule(interaction.client, guild.id, true);
    const note = config?.scheduleChannelId ? "" : " Staff haven't picked a schedule channel yet, so it only shows in `/schedule view`.";
    await interaction.editReply(`📅 Added ${DAY_NAMES[day]} at ${formatTimeOfDay(start)} (${tz}).${note}${r.eventProblem ? `\n⚠️ The Discord event couldn't be made: ${r.eventProblem}` : ""}`);
  },
};

export default command;
