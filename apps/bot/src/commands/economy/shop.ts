import { SlashCommandBuilder } from "discord.js";
import type { CommandModule } from "../types";
import { runShopCommand } from "../../modules/economy/shop";

const command: CommandModule = {
  moduleKey: "ECONOMY",
  data: new SlashCommandBuilder().setName("shop").setDescription("Spend your coins on rewards") as SlashCommandBuilder,
  execute: runShopCommand,
};
export default command;
