import { SlashCommandBuilder } from "discord.js";
import { claimDaily, getConfig } from "../../lib/economy";
import { awardAchievement } from "../../lib/achievements";
import type { CommandModule } from "../types";

const command: CommandModule = {
  moduleKey: "ECONOMY",
  data: new SlashCommandBuilder().setName("daily").setDescription("Claim your daily coin reward") as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.guildId) return;
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    const config = await getConfig(guildId);
    const result = await claimDaily(guildId, userId);

    if (!result.ok) {
      if (result.reason === "disabled") {
        await interaction.reply({ content: "The daily claim is turned off in this server.", ephemeral: true });
      } else {
        const hours = Math.ceil(result.hoursRemaining ?? 0);
        await interaction.reply({ content: `You've already claimed today. Try again in ~${hours}h.`, ephemeral: true });
      }
      return;
    }

    const streakNote = config.streakBonusPerDay > 0 ? ` (streak: ${result.streak} day${result.streak === 1 ? "" : "s"})` : "";
    await interaction.reply(`${config.currencyIcon} You claimed your daily **${result.amount} ${config.currencyName}**!${streakNote}`);

    if (result.streak >= 7) {
      await awardAchievement(interaction.client, guildId, userId, "STREAK_7", "7-Day Streak", interaction.channelId ?? undefined);
    }
    if (result.streak >= 30) {
      await awardAchievement(interaction.client, guildId, userId, "STREAK_30", "30-Day Streak", interaction.channelId ?? undefined);
    }
  },
};

export default command;
