import { SlashCommandBuilder } from "discord.js";
import type { CommandModule } from "../types";
import { runCratesCommand } from "../../modules/economy/crates";

const command: CommandModule = {
  moduleKey: "ECONOMY",
  data: new SlashCommandBuilder().setName("crates").setDescription("See and open your loot crates") as SlashCommandBuilder,
  execute: runCratesCommand,
};
export default command;
