import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandModule } from "../types";
import { runServerSetupCommand } from "../../modules/setup/serverSetupCommand";

const command: CommandModule = {
  data: new SlashCommandBuilder()
    .setName("server-setup")
    .setDescription("Build a clean, organized server layout and set up every module")
    .addStringOption((o) =>
      o
        .setName("layout")
        .setDescription("Which kind of server to build (default: Gaming community)")
        .addChoices({ name: "🎮 Gaming community", value: "gaming" }, { name: "🔴 Streaming community", value: "streaming" })
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false) as SlashCommandBuilder,
  execute: runServerSetupCommand,
};

export default command;
