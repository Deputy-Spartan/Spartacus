import { SlashCommandBuilder } from "discord.js";
import { prisma } from "../../lib/prisma";
import type { CommandModule } from "../types";

const command: CommandModule = {
  moduleKey: "VERIFICATION",
  data: new SlashCommandBuilder().setName("verify").setDescription("Verify yourself to gain access to the server") as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.guildId || !interaction.member) return;

    const config = await prisma.verificationConfig.findUnique({ where: { guildId: interaction.guildId } });
    if (!config?.verifiedRoleId) {
      await interaction.reply({ content: "Verification isn't configured for this server yet.", ephemeral: true });
      return;
    }

    const accountAgeDays = (Date.now() - interaction.user.createdTimestamp) / (1000 * 60 * 60 * 24);
    if (accountAgeDays < config.minAccountAgeDays) {
      await interaction.reply({
        content: `Your account must be at least ${config.minAccountAgeDays} day(s) old to verify.`,
        ephemeral: true,
      });
      return;
    }

    const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
    await member?.roles.add(config.verifiedRoleId).catch(() => null);
    await interaction.reply({ content: "✅ You're verified! Welcome to the server.", ephemeral: true });
  },
};

export default command;
