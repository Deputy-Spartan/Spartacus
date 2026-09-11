import { SlashCommandBuilder } from "discord.js";
import type { CommandModule } from "../types";
import { prisma } from "../../lib/prisma";
import { parseDuration } from "../../lib/duration";

const command: CommandModule = {
  moduleKey: "REMINDERS",
  data: new SlashCommandBuilder()
    .setName("remindme")
    .setDescription("Set a personal reminder")
    .addStringOption((o) =>
      o.setName("duration").setDescription("When to remind you, e.g. 10m, 2h, 1d, 1w").setRequired(true)
    )
    .addStringOption((o) => o.setName("message").setDescription("What to remind you about").setRequired(true)) as SlashCommandBuilder,

  async execute(interaction) {
    const durationInput = interaction.options.getString("duration", true);
    const message = interaction.options.getString("message", true);

    const durationMs = parseDuration(durationInput);
    if (durationMs === null) {
      await interaction.reply({
        content: "Couldn't parse that duration. Use a format like `10m`, `2h`, `1d`, or `1w` (max 90 days).",
        ephemeral: true,
      });
      return;
    }

    const remindAt = new Date(Date.now() + durationMs);

    await prisma.reminder.create({
      data: {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        message,
        remindAt,
      },
    });

    const unixSeconds = Math.floor(remindAt.getTime() / 1000);
    await interaction.reply({
      content: `⏰ Got it — I'll remind you <t:${unixSeconds}:R>.`,
      ephemeral: true,
    });
  },
};

export default command;
