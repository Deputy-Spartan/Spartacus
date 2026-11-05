import { SlashCommandBuilder } from "discord.js";
import type { CommandModule } from "../types";
import { runProfileCommand } from "../../modules/leveling/profile";

const command: CommandModule = {
  moduleKey: "PROFILE_CARDS",
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Show your profile card (or someone else's)")
    .addUserOption((o) => o.setName("user").setDescription("Whose card to show"))
    .addUserOption((o) => o.setName("compare_with").setDescription("Show a second card next to it")) as SlashCommandBuilder,
  execute: runProfileCommand,
};

export default command;
