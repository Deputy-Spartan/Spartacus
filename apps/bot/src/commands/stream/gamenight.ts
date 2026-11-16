import { SlashCommandBuilder } from "discord.js";
import { DAY_NAMES, isValidTimezone, nextTimeAt, parseTimeOfDay } from "@spartacus/shared";
import { prisma } from "../../lib/prisma";
import { postGameNight } from "../../modules/stream/gameNight";
import type { CommandModule } from "../types";

// /gamenight: post a game night sign-up. Times are in the server's time zone
// (the one set for the stream schedule) and show in everyone's own zone.
const command: CommandModule = {
  moduleKey: "STREAM_GROWTH",
  data: new SlashCommandBuilder()
    .setName("gamenight")
    .setDescription("Post a game night that viewers can sign up for")
    .setDMPermission(false)
    .addStringOption((o) => o.setName("game").setDescription("What you're playing").setRequired(true).setMaxLength(80))
    .addStringOption((o) => o.setName("time").setDescription('When it starts, e.g. "8pm", "20:30" or "in 30 min"').setRequired(true).setMaxLength(20))
    .addIntegerOption((o) => o.setName("day").setDescription("Which day (default: the next time it comes round)").addChoices(...DAY_NAMES.map((d, i) => ({ name: d, value: i }))))
    .addIntegerOption((o) => o.setName("team_size").setDescription("Players per team (leave empty for no teams)").setMinValue(1).setMaxValue(10))
    .addIntegerOption((o) => o.setName("max_players").setDescription("Most players allowed (leave empty for no limit)").setMinValue(2).setMaxValue(100))
    .addStringOption((o) => o.setName("note").setDescription("Anything players should know").setMaxLength(300)) as SlashCommandBuilder,

  async execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId || !interaction.channelId) return;
    const [extras, growth] = await Promise.all([prisma.streamExtrasConfig.findUnique({ where: { guildId } }), prisma.streamGrowthConfig.findUnique({ where: { guildId } })]);
    const tz = extras && isValidTimezone(extras.scheduleTimezone) ? extras.scheduleTimezone : "UTC";
    const raw = interaction.options.getString("time", true).trim().toLowerCase();
    let startAt: Date | null = null;
    const rel = raw.match(/^in\s+(\d{1,3})\s*(m|min|mins|minutes?|h|hr|hrs|hours?)$/);
    if (rel) startAt = new Date(Date.now() + Number(rel[1]) * (rel[2].startsWith("h") ? 3600_000 : 60_000));
    else {
      const minutes = parseTimeOfDay(raw);
      if (minutes !== null) startAt = nextTimeAt(tz, minutes, interaction.options.getInteger("day"));
    }
    if (!startAt) {
      await interaction.reply({ content: 'I couldn\'t read that time. Try "8pm", "20:30" or "in 30 min".', ephemeral: true });
      return;
    }
    if (startAt.getTime() - Date.now() > 14 * 86_400_000) {
      await interaction.reply({ content: "Game nights can be up to 2 weeks ahead.", ephemeral: true });
      return;
    }
    const open = await prisma.gameNight.count({ where: { guildId, hostId: interaction.user.id, status: { in: ["OPEN", "TEAMS"] } } });
    if (open >= 3) {
      await interaction.reply({ content: "You already have 3 game nights coming up. Cancel one first.", ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    const g = await prisma.gameNight.create({
      data: {
        guildId,
        channelId: growth?.gameNightChannelId || interaction.channelId,
        hostId: interaction.user.id,
        game: interaction.options.getString("game", true).trim(),
        note: interaction.options.getString("note")?.trim() || null,
        startAt,
        teamSize: interaction.options.getInteger("team_size") ?? 0,
        maxPlayers: interaction.options.getInteger("max_players") ?? 0,
      },
    });
    // The host is the first player.
    await prisma.gameNightPlayer.create({ data: { gameNightId: g.id, userId: interaction.user.id } }).catch(() => null);
    const r = await postGameNight(interaction.client, g, growth?.gameNightRoleId ?? null);
    if (!r.ok) {
      await prisma.gameNight.delete({ where: { id: g.id } }).catch(() => null);
      await interaction.editReply(`⚠️ ${r.error}`);
      return;
    }
    await interaction.editReply(`🎮 Posted: ${r.url}\nIt starts <t:${Math.floor(startAt.getTime() / 1000)}:F>. Players get a ping 15 minutes before${g.teamSize ? ", and teams are picked when it starts" : ""}.`);
  },
};

export default command;
