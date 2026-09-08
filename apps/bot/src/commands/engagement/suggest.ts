import { ChannelType, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isSendableChannel } from "../../lib/channels";
import type { CommandModule } from "../types";

const command: CommandModule = {
  moduleKey: "SUGGESTIONS",
  data: new SlashCommandBuilder()
    .setName("suggest")
    .setDescription("Submit a suggestion for staff to review")
    .addStringOption((o) => o.setName("suggestion").setDescription("Your suggestion").setRequired(true))
    .addChannelOption((o) =>
      o.setName("channel").setDescription("Channel to post in").addChannelTypes(ChannelType.GuildText)
    ) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.guildId) return;
    const content = interaction.options.getString("suggestion", true);
    const channelOpt = interaction.options.getChannel("channel");
    const channel = channelOpt
      ? ((await interaction.guild?.channels.fetch(channelOpt.id).catch(() => null)) ?? null)
      : interaction.channel;
    if (!isSendableChannel(channel)) {
      await interaction.reply({ content: "That channel isn't usable for suggestions.", ephemeral: true });
      return;
    }

    const suggestion = await prisma.suggestion.create({
      data: { guildId: interaction.guildId, channelId: channel.id, userId: interaction.user.id, content },
    });

    const embed = new EmbedBuilder()
      .setColor(0xfbbf24)
      .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
      .setDescription(content)
      .setFooter({ text: `Suggestion #${suggestion.id.slice(0, 8)} · Pending` });

    const message = await channel.send({ embeds: [embed] });
    await message.react("👍").catch(() => null);
    await message.react("👎").catch(() => null);
    await prisma.suggestion.update({ where: { id: suggestion.id }, data: { messageId: message.id } });

    await interaction.reply({ content: "✅ Suggestion submitted.", ephemeral: true });
  },
};

export default command;
