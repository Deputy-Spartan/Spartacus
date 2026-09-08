import { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { prisma } from "../../lib/prisma";
import type { CommandModule } from "../types";

async function resolve(interaction: import("discord.js").ChatInputCommandInteraction, status: "APPROVED" | "DENIED") {
  const id = interaction.options.getString("id", true);
  const suggestion = await prisma.suggestion.findFirst({
    where: { guildId: interaction.guildId as string, id: { startsWith: id } },
  });
  if (!suggestion) {
    await interaction.reply({ content: "No suggestion found with that ID.", ephemeral: true });
    return;
  }

  await prisma.suggestion.update({ where: { id: suggestion.id }, data: { status } });

  if (suggestion.messageId) {
    const channel = await interaction.guild?.channels.fetch(suggestion.channelId).catch(() => null);
    if (channel?.isTextBased()) {
      const message = await channel.messages.fetch(suggestion.messageId).catch(() => null);
      if (message?.embeds[0]) {
        const embed = EmbedBuilder.from(message.embeds[0])
          .setColor(status === "APPROVED" ? 0x34d399 : 0xfb7185)
          .setFooter({ text: `Suggestion #${suggestion.id.slice(0, 8)} · ${status === "APPROVED" ? "Approved" : "Denied"}` });
        await message.edit({ embeds: [embed] }).catch(() => null);
      }
    }
  }

  await interaction.reply(`${status === "APPROVED" ? "✅" : "❌"} Suggestion marked ${status.toLowerCase()}.`);
}

export const approveCommand: CommandModule = {
  moduleKey: "SUGGESTIONS",
  data: new SlashCommandBuilder()
    .setName("approve-suggestion")
    .setDescription("Approve a suggestion")
    .addStringOption((o) => o.setName("id").setDescription("Suggestion ID (first 8 chars shown on the embed)").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers) as SlashCommandBuilder,
  async execute(interaction) {
    await resolve(interaction, "APPROVED");
  },
};

export const denyCommand: CommandModule = {
  moduleKey: "SUGGESTIONS",
  data: new SlashCommandBuilder()
    .setName("deny-suggestion")
    .setDescription("Deny a suggestion")
    .addStringOption((o) => o.setName("id").setDescription("Suggestion ID (first 8 chars shown on the embed)").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers) as SlashCommandBuilder,
  async execute(interaction) {
    await resolve(interaction, "DENIED");
  },
};
