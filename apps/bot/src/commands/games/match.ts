import { SlashCommandBuilder } from "discord.js";
import type { CommandModule } from "../types";
import { handleMatchCommand } from "../../modules/matches/flow";

const command: CommandModule = {
  moduleKey: "MATCHES",
  data: new SlashCommandBuilder()
    .setName("match")
    .setDescription("Single matches and tournaments")
    .addSubcommand((s) => s.setName("join").setDescription("Sign up for the open match"))
    .addSubcommand((s) => s.setName("leave").setDescription("Leave the sign-ups"))
    .addSubcommand((s) => s.setName("stats").setDescription("See your record, rating and coins"))
    .addSubcommand((s) => s.setName("leaderboard").setDescription("See the season leaderboard"))
    .addSubcommand((s) =>
      s
        .setName("setrank")
        .setDescription("Staff: correct a player's rank")
        .addUserOption((o) => o.setName("user").setDescription("The player").setRequired(true))
        .addStringOption((o) => o.setName("rank").setDescription("The rank name").setRequired(true))
    ) as SlashCommandBuilder,

  execute: handleMatchCommand,
};

export default command;
