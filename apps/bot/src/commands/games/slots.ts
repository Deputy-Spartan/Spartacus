import { SlashCommandBuilder } from "discord.js";
import { addBalance, getBalance, getConfig } from "../../lib/economy";
import type { CommandModule } from "../types";

const SYMBOLS = ["🍒", "🍋", "🔔", "⭐", "💎"];

function spin(): string[] {
  return [0, 0, 0].map(() => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
}

function payoutMultiplier(reels: string[]): number {
  if (reels[0] === reels[1] && reels[1] === reels[2]) return reels[0] === "💎" ? 10 : 5;
  if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) return 1.5;
  return 0;
}

const command: CommandModule = {
  moduleKey: "CASINO",
  data: new SlashCommandBuilder()
    .setName("slots")
    .setDescription("Wager coins on the slot machine")
    .addIntegerOption((o) => o.setName("amount").setDescription("Amount to wager").setRequired(true).setMinValue(1)) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.guildId) return;
    const amount = interaction.options.getInteger("amount", true);

    const [balance, config] = await Promise.all([getBalance(interaction.guildId, interaction.user.id), getConfig(interaction.guildId)]);

    if (amount > config.maxBet) {
      await interaction.reply({ content: `The max bet is ${config.maxBet.toLocaleString()} ${config.currencyName}.`, ephemeral: true });
      return;
    }
    if (amount > balance) {
      await interaction.reply({ content: "You don't have enough coins for that wager.", ephemeral: true });
      return;
    }

    const reels = spin();
    const multiplier = payoutMultiplier(reels);
    const delta = multiplier > 0 ? Math.floor(amount * multiplier) - amount : -amount;
    await addBalance(interaction.guildId, interaction.user.id, delta);

    const outcome = multiplier > 0 ? `You won **${Math.floor(amount * multiplier).toLocaleString()} ${config.currencyName}**! 🎉` : `You lost **${amount.toLocaleString()} ${config.currencyName}**.`;

    await interaction.reply(`🎰 [ ${reels.join(" | ")} ]\n${outcome}`);
  },
};

export default command;
