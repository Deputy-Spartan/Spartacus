import { SlashCommandBuilder } from "discord.js";
import { prisma } from "../../lib/prisma";
import { verifyMember } from "../../modules/security/verification";
import type { CommandModule } from "../types";

const command: CommandModule = {
  moduleKey: "VERIFICATION",
  data: new SlashCommandBuilder().setName("verify").setDescription("Verify yourself to gain access to the server") as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.guildId || !interaction.member) return;

    const config = await prisma.verificationConfig.findUnique({ where: { guildId: interaction.guildId } });
    const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
    if (!member) return;

    const result = await verifyMember(config, member, interaction.user.createdTimestamp);
    await interaction.reply({ content: result.message, ephemeral: true });
  },
};

export default command;
