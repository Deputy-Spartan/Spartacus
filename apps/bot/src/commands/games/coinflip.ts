import { SlashCommandBuilder } from "discord.js";
import { addBalance, getBalance, getConfig } from "../../lib/economy";
import type { CommandModule } from "../types";

const command: CommandModule = {
  moduleKey: "CASINO",
  data: new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("Wager coins on a coin flip")
    .addIntegerOption((o) => o.setName("amount").setDescription("Amount to wager").setRequired(true).setMinValue(1))
    .addStringOption((o) =>
      o
        .setName("side")
        .setDescription("Heads or tails")
        .setRequired(true)
        .addChoices({ name: "Heads", value: "heads" }, { name: "Tails", value: "tails" })
    ) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.guildId) return;
    const amount = interaction.options.getInteger("amount", true);
    const side = interaction.options.getString("side", true);

    const [balance, config] = await Promise.all([getBalance(interaction.guildId, interaction.user.id), getConfig(interaction.guildId)]);

    if (amount > config.maxBet) {
      await interaction.reply({ content: `The max bet is ${config.maxBet.toLocaleString()} ${config.currencyName}.`, ephemeral: true });
      return;
    }
    if (amount > balance) {
      await interaction.reply({ content: "You don't have enough coins for that wager.", ephemeral: true });
      return;
    }

    const result = Math.random() < 0.5 ? "heads" : "tails";
    const won = result === side;
    const delta = won ? amount : -amount;
    await addBalance(interaction.guildId, interaction.user.id, delta, "casino", config.maxBalance);

    await interaction.reply(
      `🪙 The coin landed on **${result}**. ${won ? `You won **${amount.toLocaleString()} ${config.currencyName}**! 🎉` : `You lost **${amount.toLocaleString()} ${config.currencyName}**.`}`
    );
  },
};

export default command;
