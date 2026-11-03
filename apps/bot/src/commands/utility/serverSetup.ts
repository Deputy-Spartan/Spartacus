import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandModule } from "../types";
import { runServerSetupCommand } from "../../modules/setup/serverSetupCommand";

const command: CommandModule = {
  data: new SlashCommandBuilder()
    .setName("server-setup")
    .setDescription("Build a clean, organized gaming server layout and set up every module")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false) as SlashCommandBuilder,
  execute: runServerSetupCommand,
};

export default command;
