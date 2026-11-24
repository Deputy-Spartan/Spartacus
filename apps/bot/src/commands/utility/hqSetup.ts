import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandModule } from "../types";
import { runServerSetupCommand } from "../../modules/setup/serverSetupCommand";

// The same builder as /server-setup, always with the Spartacus HQ layout: a server for
// testing Spartacus and supporting OG Armory customers, opened up by rules and onboarding.
const command: CommandModule = {
  data: new SlashCommandBuilder()
    .setName("hq-setup")
    .setDescription("Start fresh and build Spartacus HQ: bot testing, Spartacus help and store support (asks first)")
    .addBooleanOption((o) => o.setName("fresh-roles").setDescription("Delete every old role and keep only the ones HQ needs (asks first)"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false) as SlashCommandBuilder,
  execute: (interaction) => runServerSetupCommand(interaction, "hq"),
};

export default command;
