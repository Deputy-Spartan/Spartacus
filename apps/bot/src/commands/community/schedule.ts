import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import {
  DAY_NAMES,
  REPEAT_LABELS,
  REPEAT_NEEDS_DATE,
  SCHEDULE_REPEATS,
  cleanRepeat,
  cleanScheduleDate,
  dayOfDate,
  describeRepeat,
  formatTimeOfDay,
  parseDay,
  parseTimeOfDay,
  type ScheduleRepeat,
} from "@spartacus/shared";
import { prisma } from "../../lib/prisma";
import { removeSlot, schedulePayload, updateSchedule } from "../../modules/stream/schedule";
import type { CommandModule } from "../types";

const MAX_SLOTS = 60;
const MAX_PER_PERSON = 14;

// "2026-11-27", "11/27", "Nov 27", "27 Nov" → YYYY-MM-DD (the next one coming up when no year is given).
function parseDate(input: string): string | null {
  const s = input.trim();
  const iso = cleanScheduleDate(s);
  if (iso) return iso;
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  let mo: number | null = null;
  let d: number | null = null;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (m) [mo, d] = [+m[1] - 1, +m[2]];
  const named = s.toLowerCase().match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?$|^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*$/);
  if (named) {
    const name = named[1] ?? named[4];
    mo = months.indexOf(name);
    d = +(named[2] ?? named[3]);
  }
  if (mo === null || mo < 0 || !d) return null;
  const now = new Date();
  for (const y of [now.getUTCFullYear(), now.getUTCFullYear() + 1]) {
    const date = `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (cleanScheduleDate(date) && new Date(date + "T23:59:59Z").getTime() >= now.getTime() - 86_400_000) return date;
  }
  return null;
}

// /schedule: the stream schedule. Anyone can look; staff and streamers
// (linked on the dashboard, or holding the streamer role) can add their own.
const command: CommandModule = {
  moduleKey: "STREAM_EXTRAS",
  data: new SlashCommandBuilder()
    .setName("schedule")
    .setDescription("The stream schedule")
    .setDMPermission(false)
    .addSubcommand((s) => s.setName("view").setDescription("See the schedule"))
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Add a stream to the schedule")
        .addStringOption((o) => o.setName("time").setDescription("Start time in the server's time zone, e.g. 7pm or 19:30").setRequired(true))
        .addStringOption((o) =>
          o
            .setName("repeats")
            .setDescription("How often (default: every week)")
            .addChoices(...SCHEDULE_REPEATS.map((r) => ({ name: REPEAT_LABELS[r], value: r })))
        )
        .addStringOption((o) => o.setName("day").setDescription("Day of the week, for weekly streams, e.g. Friday"))
        .addStringOption((o) => o.setName("date").setDescription("The date, for one-time, every-2-weeks or monthly streams, e.g. Nov 27"))
        .addStringOption((o) => o.setName("playing").setDescription("What you'll be playing").setMaxLength(80))
        .addStringOption((o) => o.setName("title").setDescription("The stream's title").setMaxLength(100))
        .addStringOption((o) => o.setName("message").setDescription("A note for viewers, e.g. what you have planned").setMaxLength(300))
        .addIntegerOption((o) => o.setName("hours").setDescription("How long, in hours (default 2)").setMinValue(1).setMaxValue(12))
        .addStringOption((o) => o.setName("link").setDescription("Where to watch (a link)").setMaxLength(200))
        .addStringOption((o) => o.setName("name").setDescription("Name to show (default: your server name)").setMaxLength(60)),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Remove one of your streams from the schedule")
        .addStringOption((o) => o.setName("time").setDescription("Its start time").setRequired(true))
        .addStringOption((o) => o.setName("day").setDescription("Its day (leave empty for daily, weekday or weekend streams)")),
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
      const payload = await schedulePayload({ guildId: guild.id, scheduleTimezone: tz, scheduleEmbedId: config?.scheduleEmbedId ?? null }, slots);
      await interaction.reply({ embeds: payload.embeds, ephemeral: true });
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
    const start = parseTimeOfDay(interaction.options.getString("time", true));
    const dayText = interaction.options.getString("day");
    const day = dayText ? parseDay(dayText) : null;
    if (start === null || (dayText && day === null)) {
      await interaction.reply({ content: "I couldn't read that day or time. Try a day like `Friday` and a time like `7pm` or `19:30`.", ephemeral: true });
      return;
    }

    if (sub === "remove") {
      await interaction.deferReply({ ephemeral: true });
      const mine = await prisma.streamSlot.findMany({
        where: {
          guildId: guild.id,
          startMinutes: start,
          ...(day === null ? {} : { OR: [{ dayOfWeek: day }, { repeat: { in: ["DAILY", "WEEKDAYS", "WEEKENDS"] } }] }),
          ...(staff ? {} : { userId: member.id }),
        },
      });
      if (!mine.length) {
        await interaction.editReply(`I couldn't find ${staff ? "a" : "one of your"} stream${day === null ? "" : ` on ${DAY_NAMES[day]}`} at ${formatTimeOfDay(start)}.`);
        return;
      }
      for (const s of mine) await removeSlot(interaction.client, s.id);
      await updateSchedule(interaction.client, guild.id, true);
      await interaction.editReply(`🗑️ Removed ${mine.length === 1 ? "it" : `${mine.length} streams`} from the schedule.`);
      return;
    }

    // add
    const repeat: ScheduleRepeat = cleanRepeat(interaction.options.getString("repeats") ?? "WEEKLY");
    const dateText = interaction.options.getString("date");
    const date = dateText ? parseDate(dateText) : null;
    if (dateText && !date) {
      await interaction.reply({ content: "I couldn't read that date. Try something like `Nov 27` or `2026-11-27`.", ephemeral: true });
      return;
    }
    if (REPEAT_NEEDS_DATE.has(repeat) && !date) {
      await interaction.reply({ content: `${REPEAT_LABELS[repeat]} needs a \`date\`, e.g. \`Nov 27\`${repeat === "ONCE" ? "" : " (the first stream)"}.`, ephemeral: true });
      return;
    }
    if (repeat === "WEEKLY" && day === null && !date) {
      await interaction.reply({ content: "Pick a `day` for a weekly stream, e.g. `Friday`.", ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });

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
    const slot = await prisma.streamSlot.create({
      data: {
        guildId: guild.id,
        userId: member.id,
        streamer: interaction.options.getString("name") || member.displayName,
        title: interaction.options.getString("playing"),
        streamTitle: interaction.options.getString("title"),
        message: interaction.options.getString("message"),
        link,
        repeat,
        startDate: REPEAT_NEEDS_DATE.has(repeat) ? date : null,
        dayOfWeek: date ? dayOfDate(date) : (day ?? 0),
        startMinutes: start,
        durationMin: (interaction.options.getInteger("hours") ?? 2) * 60,
      },
    });
    const r = await updateSchedule(interaction.client, guild.id, true);
    const note = config?.scheduleChannelId ? "" : " Staff haven't picked a schedule channel yet, so it only shows in `/schedule view`.";
    await interaction.editReply(`📅 Added: ${describeRepeat(slot)} (${tz}).${note}${r.eventProblem ? `\n⚠️ The Discord event couldn't be made: ${r.eventProblem}` : ""}`);
  },
};

export default command;
