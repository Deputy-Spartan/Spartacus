import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { CommandModule } from "../types";
import { prisma } from "../../lib/prisma";
import { isSendableChannel } from "../../lib/channels";

const command: CommandModule = {
  moduleKey: "CONFESSIONS",
  data: new SlashCommandBuilder()
    .setName("confess")
    .setDescription("Post an anonymous message to this server")
    .addStringOption((o) =>
      o.setName("message").setDescription("Your message").setRequired(true).setMaxLength(1000)
    ) as SlashCommandBuilder,

  async execute(interaction) {
    const guildId = interaction.guildId as string;
    const message = interaction.options.getString("message", true);

    const settings = await prisma.confessionSettings.findUnique({ where: { guildId } });
    if (!settings?.channelId) {
      await interaction.reply({ content: "Anonymous messages aren't set up on this server yet.", ephemeral: true });
      return;
    }

    const channel = await interaction.client.channels.fetch(settings.channelId).catch(() => null);
    if (!isSendableChannel(channel)) {
      // Deliberately vague — don't confirm/deny channel state in a way that
      // could be used to probe configuration; just tell the user it didn't work.
      await interaction.reply({ content: "Your message couldn't be posted right now. Try again later.", ephemeral: true });
      return;
    }

    const messageNumber = settings.nextNumber;

    // Embed intentionally carries no author/user/avatar reference anywhere —
    // that's the entire point of the feature. Never log the sender's id
    // alongside the message content either.
    const embed = new EmbedBuilder()
      .setTitle(`Anonymous #${messageNumber}`)
      .setDescription(message)
      .setColor("#8A2BE2")
      .setTimestamp();

    await channel.send({ embeds: [embed] });

    await prisma.confessionSettings.update({
      where: { guildId },
      data: { nextNumber: messageNumber + 1 },
    });

    // Ephemeral — only the sender ever sees this, and it says nothing about
    // which channel it was posted to (that's visible only by reading the
    // channel itself, same as anyone else would see it).
    await interaction.reply({ content: "Your message was posted anonymously.", ephemeral: true });
  },
};

export default command;
