import { SlashCommandBuilder } from "discord.js";
import { getConfig, transfer } from "../../lib/economy";
import type { CommandModule } from "../types";

const command: CommandModule = {
  moduleKey: "ECONOMY",
  data: new SlashCommandBuilder()
    .setName("pay")
    .setDescription("Send some of your coins to another member")
    .addUserOption((o) => o.setName("user").setDescription("Who to pay").setRequired(true))
    .addIntegerOption((o) => o.setName("amount").setDescription("Amount to send").setRequired(true).setMinValue(1)) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.guildId) return;
    const target = interaction.options.getUser("user", true);
    const amount = interaction.options.getInteger("amount", true);
    const config = await getConfig(interaction.guildId);

    if (target.id === interaction.user.id) {
      await interaction.reply({ content: "You can't pay yourself.", ephemeral: true });
      return;
    }
    if (target.bot) {
      await interaction.reply({ content: "You can't pay a bot.", ephemeral: true });
      return;
    }

    const result = await transfer(interaction.guildId, interaction.user.id, target.id, amount);

    if (!result.ok) {
      const messages = {
        disabled: "Transfers between members are turned off in this server.",
        below_minimum: `The minimum transfer is ${config.transferMinAmount} ${config.currencyName}.`,
        insufficient: "You don't have enough coins for that.",
      };
      await interaction.reply({ content: messages[result.reason], ephemeral: true });
      return;
    }

    const taxNote = result.tax > 0 ? ` (${result.tax} ${config.currencyName} tax withheld)` : "";
    await interaction.reply(`${config.currencyIcon} Sent **${result.received} ${config.currencyName}** to ${target}${taxNote}.`);
  },
};

export default command;
