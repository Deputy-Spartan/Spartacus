import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isSendableChannel } from "../../lib/channels";
import type { CommandModule } from "../types";

function buildEmbed(question: string, options: string[], counts: number[]) {
  const total = counts.reduce((a, b) => a + b, 0);
  return new EmbedBuilder()
    .setColor(0x00e5ff)
    .setTitle(`📊 ${question}`)
    .setDescription(
      options
        .map((opt, i) => {
          const pct = total ? Math.round((counts[i] / total) * 100) : 0;
          return `**${i + 1}. ${opt}** — ${counts[i]} vote(s) (${pct}%)`;
        })
        .join("\n")
    );
}

function buildRow(pollId: string, options: string[]) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    options.slice(0, 5).map((opt, i) => new ButtonBuilder().setCustomId(`poll:${pollId}:${i}`).setLabel(opt.slice(0, 70)).setStyle(ButtonStyle.Secondary))
  );
}

const command: CommandModule = {
  moduleKey: "POLLS",
  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Post a poll members can vote on")
    .addStringOption((o) => o.setName("question").setDescription("The poll question").setRequired(true))
    .addStringOption((o) => o.setName("options").setDescription("Comma-separated options (2-5)").setRequired(true))
    .addChannelOption((o) =>
      o.setName("channel").setDescription("Channel to post in").addChannelTypes(ChannelType.GuildText)
    ) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.guildId) return;
    const question = interaction.options.getString("question", true);
    const options = interaction.options
      .getString("options", true)
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean)
      .slice(0, 5);

    if (options.length < 2) {
      await interaction.reply({ content: "Provide at least 2 comma-separated options.", ephemeral: true });
      return;
    }

    const channelOpt = interaction.options.getChannel("channel");
    const channel = channelOpt
      ? ((await interaction.guild?.channels.fetch(channelOpt.id).catch(() => null)) ?? null)
      : interaction.channel;
    if (!isSendableChannel(channel)) {
      await interaction.reply({ content: "That channel isn't usable for a poll.", ephemeral: true });
      return;
    }

    const poll = await prisma.poll.create({
      data: { guildId: interaction.guildId, channelId: channel.id, question, options },
    });

    const message = await channel.send({
      embeds: [buildEmbed(question, options, options.map(() => 0))],
      components: [buildRow(poll.id, options)],
    });

    await prisma.poll.update({ where: { id: poll.id }, data: { messageId: message.id } });
    await interaction.reply({ content: `✅ Poll posted in <#${channel.id}>.`, ephemeral: true });
  },
};

export default command;

export async function handlePollVote(interaction: import("discord.js").ButtonInteraction, pollId: string, optionIndex: number) {
  const poll = await prisma.poll.findUnique({ where: { id: pollId }, include: { votes: true } });
  if (!poll || poll.closed) {
    await interaction.reply({ content: "This poll is no longer accepting votes.", ephemeral: true });
    return;
  }

  await prisma.pollVote.upsert({
    where: { pollId_userId: { pollId, userId: interaction.user.id } },
    create: { pollId, userId: interaction.user.id, option: optionIndex },
    update: { option: optionIndex },
  });

  const votes = await prisma.pollVote.findMany({ where: { pollId } });
  const counts = poll.options.map((_, i) => votes.filter((v) => v.option === i).length);

  await interaction.update({ embeds: [buildEmbed(poll.question, poll.options, counts)] });
}
