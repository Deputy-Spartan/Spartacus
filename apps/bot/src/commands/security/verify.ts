import { SlashCommandBuilder } from "discord.js";
import { startVerification } from "../../modules/security/verification";
import type { CommandModule } from "../types";

// Same as pressing the panel's Verify button, captcha included.
const command: CommandModule = {
  moduleKey: "VERIFICATION",
  data: new SlashCommandBuilder().setName("verify").setDescription("Verify yourself to gain access to the server") as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.guildId || !interaction.member) return;
    await startVerification(interaction);
  },
};

export default command;
